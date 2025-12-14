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
    browser: ['RSMN News', 'Chrome', '1.0.0'],
    syncFullHistory: false,
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
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut

      if (shouldReconnect) {
        console.log('🔄 Reconectando...')
        setTimeout(initWhatsApp, 5000)
      } else {
        console.log('❌ Sesión cerrada. Necesitas escanear el QR nuevamente.')
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

export async function sendMessage(to, message) {
  const client = getWhatsAppClient()
  await client.sendMessage(to, { text: message })
  logger.info(`✅ Message sent to ${to}`)
}
