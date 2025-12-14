import cron from 'node-cron'
import {
  getSummary,
  refreshSummary,
  isCacheRecent,
} from '../services/ai-summarizer.js'
import { getWhatsAppClient, isWhatsAppConnected } from '../services/whatsapp.js'
import { logger } from '../utils/logger.js'
import User from '../models/User.js'

// Sleep helper to avoid rate limiting
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Limpiar caracteres problemáticos para WhatsApp (incluyendo emojis)
function cleanForWhatsApp(text) {
  return text
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Control characters
    .replace(/[\uFFF0-\uFFFF]/g, '') // Specials
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, '') // Emojis misc
    .replace(/[\u{2600}-\u{26FF}]/gu, '') // Misc symbols
    .replace(/[\u{2700}-\u{27BF}]/gu, '') // Dingbats
    .replace(/[\u{1F600}-\u{1F64F}]/gu, '') // Emoticons
    .replace(/[\u{1F680}-\u{1F6FF}]/gu, '') // Transport
    .replace(/[\u{1F1E0}-\u{1F1FF}]/gu, '') // Flags
    .trim()
}

// Extraer las 6 principales noticias y formatear para WhatsApp
function formatWhatsAppMessage(summary) {
  const principalesMatch = summary.match(
    /## PRINCIPALES([\s\S]*?)(?=## [A-ZÁÉÍÓÚ]|$)/
  )

  if (!principalesMatch) {
    const lines = summary
      .split('\n')
      .filter((l) => l.trim().startsWith('-'))
      .slice(0, 6)
    const bullets = lines
      .map((l) => `• ${cleanForWhatsApp(l.replace(/^-\s*/, '').trim())}`)
      .join('\n\n')
    return `*RSMN - Las noticias del dia*\n\n${bullets}\n\nMas noticias en rsmn.ar`
  }

  const principalesText = principalesMatch[1]
  const newsLines = principalesText
    .split('\n')
    .filter((l) => l.trim().startsWith('-'))
    .slice(0, 6)
    .map((l) => {
      const text = cleanForWhatsApp(l.replace(/^-\s*/, '').trim())
      const colonIndex = text.indexOf(':')
      if (colonIndex > 0 && colonIndex < 50) {
        const titulo = text.substring(0, colonIndex).trim().toUpperCase()
        const desc = text.substring(colonIndex + 1).trim()
        return `• *${titulo}:* ${desc}`
      }
      return `• ${text}`
    })

  return `*RSMN - Las noticias del dia*\n\n${newsLines.join(
    '\n\n'
  )}\n\nMas noticias en rsmn.ar`
}

async function sendDailySummary() {
  try {
    // Verificar que WhatsApp esté conectado
    if (!isWhatsAppConnected()) {
      logger.warn('⚠️ WhatsApp not connected, skipping daily send')
      return
    }

    logger.info('⏰ Starting daily news summary job...')

    // Get all subscribed users
    const subscribers = await User.find({ subscribed: true })

    if (subscribers.length === 0) {
      logger.info('No subscribers found')
      return
    }

    logger.info(`📤 Sending to ${subscribers.length} subscribers...`)

    // Usar el cache existente (ya se refrescó antes)
    const summary = await getSummary()
    const whatsappMessage = formatWhatsAppMessage(summary)

    const sock = getWhatsAppClient()

    // Send to each subscriber with delay to avoid WhatsApp rate limiting
    for (let i = 0; i < subscribers.length; i++) {
      const user = subscribers[i]
      try {
        const phoneNumber = `${user.phone}@s.whatsapp.net`

        await sock.sendMessage(phoneNumber, {
          text: whatsappMessage,
        })

        logger.info(`✅ Sent to ${user.phone} (${i + 1}/${subscribers.length})`)

        // Wait 3 seconds between messages to avoid rate limiting
        if (i < subscribers.length - 1) {
          await sleep(3000)
        }
      } catch (error) {
        logger.error(`❌ Failed to send to ${user.phone}:`, error.message)
        // Si falla, esperar más tiempo antes del siguiente intento
        await sleep(5000)
      }
    }

    logger.info('✅ Daily summary job completed')
  } catch (error) {
    logger.error('Error in daily summary job:', error)
  }
}

export function startCronJobs() {
  // Refrescar cache cada 30 minutos
  cron.schedule(
    '*/30 * * * *',
    async () => {
      logger.info('⏰ Running scheduled cache refresh...')
      try {
        await refreshSummary()
      } catch (error) {
        logger.error('Error in cache refresh job:', error)
      }
    },
    {
      timezone: 'America/Argentina/Buenos_Aires',
    }
  )

  logger.info('⏰ Cache refresh scheduled: Every 30 minutes')

  // Refresh a las 5:55 AM para tener noticias frescas antes del envío
  cron.schedule(
    '55 5 * * *',
    async () => {
      logger.info('🌅 Pre-daily refresh (5:55 AM)...')
      try {
        await refreshSummary()
      } catch (error) {
        logger.error('Error in pre-daily refresh:', error)
      }
    },
    {
      timezone: 'America/Argentina/Buenos_Aires',
    }
  )

  logger.info('⏰ Pre-daily refresh scheduled: 5:55 AM')

  // Envío diario a las 6:00 AM
  cron.schedule('0 6 * * *', sendDailySummary, {
    timezone: 'America/Argentina/Buenos_Aires',
  })

  logger.info('⏰ Daily send scheduled: 6:00 AM (Argentina time)')

  // Al arrancar: verificar si necesitamos refrescar el cache
  isCacheRecent().then(async (isRecent) => {
    if (isRecent) {
      logger.info('📦 Cache is recent (<30 min), skipping initial refresh')
    } else {
      logger.info('🔄 Cache is old or missing, refreshing...')
      try {
        await refreshSummary()
      } catch (err) {
        logger.error('Initial refresh error:', err)
      }
    }

    // En development, enviar a suscriptores (independiente del refresh)
    if (process.env.NODE_ENV === 'development') {
      logger.info('🧪 DEV MODE: Will send to subscribers in 10 seconds...')
      setTimeout(() => {
        logger.info('🧪 DEV MODE: Sending to subscribers now...')
        sendDailySummary()
      }, 10000)
    }
  })
}
