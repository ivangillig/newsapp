import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys'
import pino from 'pino'
import qrcode from 'qrcode-terminal'
import { logger } from '../utils/logger.js'
import { handleIncomingMessage } from '../handlers/whatsapp-commands.js'

let sock = null
let isConnected = false

// Mutex simple para procesar mensajes uno a la vez
const processingQueue = new Map()

async function processMessageWithLock(key, handler) {
  // Esperar si ya hay un mensaje procesándose para este usuario
  while (processingQueue.has(key)) {
    await new Promise((r) => setTimeout(r, 100))
  }
  processingQueue.set(key, true)
  try {
    await handler()
  } finally {
    processingQueue.delete(key)
  }
}

export async function initWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(
    './auth_info_baileys'
  )
  const { version } = await fetchLatestBaileysVersion()

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: ['RSM News', 'Chrome', '1.0.0'],
    syncFullHistory: false,
    printQRInTerminal: false,
    shouldIgnoreJid: (jid) => jid.endsWith('@g.us'), // Ignore group messages
    retryRequestDelayMs: 1000, // Increased delay
    maxMsgRetryCount: 2,
    defaultQueryTimeoutMs: 60000,
    getMessage: async () => undefined, // Avoid fetching old messages
  })

  // Save credentials on update
  sock.ev.on('creds.update', saveCreds)

  // QR Code handler
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      console.log('\n📱 Escanea este QR con WhatsApp:\n')
      qrcode.generate(qr, { small: true })
    }

    if (connection === 'close') {
      isConnected = false
      const statusCode = lastDisconnect?.error?.output?.statusCode
      const errorMessage = lastDisconnect?.error?.message
      
      console.log(`⚠️ Conexión cerrada - Código: ${statusCode}, Mensaje: ${errorMessage}`)
      console.log('DisconnectReason.loggedOut =', DisconnectReason.loggedOut)
      
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut

      if (shouldReconnect) {
        console.log('🔄 Reconectando...')
        setTimeout(initWhatsApp, 5000)
      } else {
        console.log('❌ Sesión cerrada. Eliminando credenciales y generando nuevo QR...')
        
        // Close socket first to release file handles
        try {
          if (sock) {
            sock.ev.removeAllListeners()
            sock.end(undefined)
            sock = null
          }
        } catch (e) {
          console.error('Error cerrando socket:', e.message)
        }

        // Wait for file handles to be released, then clean up
        setTimeout(async () => {
          const fs = await import('fs')
          const authPath = './auth_info_baileys'
          
          try {
            if (fs.existsSync(authPath)) {
              // Delete files one by one
              const files = fs.readdirSync(authPath)
              for (const file of files) {
                try {
                  fs.unlinkSync(`${authPath}/${file}`)
                } catch (e) {
                  // Ignore individual file errors
                }
              }
              // Try to remove empty directory
              try {
                fs.rmdirSync(authPath)
              } catch (e) {
                // Directory might still be locked, that's ok
              }
              console.log('🗑️ Credenciales limpiadas')
            }
          } catch (err) {
            console.error('Error eliminando credenciales:', err.message)
          }
          
          // Reinitialize to generate new QR
          console.log('🔄 Generando nuevo QR...')
          await initWhatsApp()
        }, 3000) // Wait 3 seconds for handles to release
      }
    }

    if (connection === 'open') {
      isConnected = true
      logger.info('✅ WhatsApp connected successfully')
    }
  })

  // Handle incoming messages
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return

    const msg = messages[0]

    if (!msg.message || msg.key.fromMe) return
    if (msg.key.remoteJid?.endsWith('@g.us')) return

    const remoteJid = msg.key.remoteJid

    // Extraer el número real y el LID
    let phone
    let lid = null

    if (remoteJid?.includes('@lid')) {
      lid = remoteJid.split('@')[0]
      if (msg.key.senderPn) {
        phone = msg.key.senderPn.split('@')[0]
      } else {
        logger.warn(`Mensaje de LID sin senderPn, ignorando: ${remoteJid}`)
        return
      }
    } else {
      phone = remoteJid.split('@')[0]
    }

    const text =
      msg.message.conversation || msg.message.extendedTextMessage?.text || ''

    if (!text.trim()) return

    logger.info(`📩 Message from ${phone}: ${text}`)

    // Procesar con lock para evitar race conditions
    await processMessageWithLock(phone, async () => {
      await handleIncomingMessage(sock, remoteJid, text, phone, lid)
    })
  })

  return sock
}

export function getWhatsAppClient() {
  if (!sock) {
    throw new Error('WhatsApp client not initialized')
  }
  return sock
}

export function isWhatsAppConnected() {
  return isConnected
}

// Message queue to prevent concurrent sends to same contact
const messageQueue = new Map()

async function sendWithQueue(to, handler) {
  // Wait if already sending to this contact
  while (messageQueue.has(to)) {
    await new Promise((r) => setTimeout(r, 200))
  }

  messageQueue.set(to, true)
  try {
    await handler()
    // Longer delay between messages to prevent session conflicts
    await new Promise((r) => setTimeout(r, 1500))
  } finally {
    messageQueue.delete(to)
  }
}

export async function sendMessage(to, message) {
  return sendWithQueue(to, async () => {
    const client = getWhatsAppClient()

    // Limit message length (WhatsApp limit is ~65k but we stay conservative)
    const maxLength = 4000
    let finalMessage = message

    if (message.length > maxLength) {
      logger.warn(`Message too long (${message.length} chars), truncating...`)
      finalMessage =
        message.substring(0, maxLength - 50) +
        '\n\n...\n\nMensaje truncado por longitud.'
    }

    try {
      await client.sendMessage(to, { text: finalMessage })
      logger.info(`✅ Message sent to ${to} (${finalMessage.length} chars)`)
    } catch (error) {
      logger.error(`❌ Failed to send message to ${to}:`, error)
      throw error
    }
  })
}
