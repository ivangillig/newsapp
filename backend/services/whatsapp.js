import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys'
import qrcode from 'qrcode-terminal'
import { logger } from '../utils/logger.js'
import { handleIncomingMessage } from '../handlers/whatsapp-commands.js'

let sock = null
let isConnected = false

export async function initWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(
    './auth_info_baileys'
  )
  const { version } = await fetchLatestBaileysVersion()

  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: logger,
    browser: ['RSMN News', 'Chrome', '1.0.0'],
    syncFullHistory: false,
  })

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

      logger.info('Connection closed. Reconnecting:', shouldReconnect)

      if (shouldReconnect) {
        await initWhatsApp()
      }
    } else if (connection === 'open') {
      isConnected = true
      logger.info('✅ WhatsApp connected successfully')
    }
  })

  // Save credentials on update
  sock.ev.on('creds.update', saveCreds)

  // Handle incoming messages
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    // Solo procesar mensajes nuevos (notify), ignorar otros tipos como append
    if (type !== 'notify') return

    const msg = messages[0]

    // Ignorar si no hay mensaje, es propio, o es de grupo
    if (!msg.message || msg.key.fromMe) return
    if (msg.key.remoteJid?.endsWith('@g.us')) return // Ignorar grupos

    // Obtener el número de teléfono real (senderPn tiene prioridad sobre remoteJid)
    const from = msg.key.senderPn || msg.key.remoteJid

    // Si es un LID sin senderPn, ignorar (no podemos responder)
    if (from.includes('@lid')) {
      logger.warn(`Mensaje de LID sin senderPn, ignorando: ${from}`)
      return
    }

    const text =
      msg.message.conversation || msg.message.extendedTextMessage?.text || ''

    if (!text.trim()) return // Ignorar mensajes vacíos

    logger.info(`📩 Message from ${from}: ${text}`)

    await handleIncomingMessage(sock, from, text)
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
