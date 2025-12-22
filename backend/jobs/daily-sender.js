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

// Clean problematic characters for WhatsApp (including emojis)
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

// Extract PRINCIPALES news and format for WhatsApp
function formatWhatsAppMessage(articles) {
  const appDomain = process.env.APP_DOMAIN || 'rsm.ar'

  try {
    // Filter only PRINCIPALES (already comes as array)
    const principales = articles.filter((article) =>
      article.category.toLowerCase().includes('principales')
    )

    if (principales.length === 0) {
      logger.warn('⚠️ No PRINCIPALES articles found for WhatsApp')
      return `*RSM - Las noticias del dia*\n\nNo hay noticias principales disponibles\n\nMas noticias en ${appDomain}`
    }

    // Format for WhatsApp
    const newsLines = principales
      .slice(0, 6) // Maximum 6 news
      .map((article) => {
        const titulo = cleanForWhatsApp(article.title).toUpperCase()
        const desc = cleanForWhatsApp(article.description)
        return `• *${titulo}:* ${desc}`
      })

    return `*RSM - Las noticias del dia*\n\n${newsLines.join(
      '\n\n'
    )}\n\nMas noticias en ${appDomain}`
  } catch (error) {
    logger.error('Error formatting articles for WhatsApp:', error)
    return `*RSM - Las noticias del dia*\n\nError al procesar noticias\n\nMas noticias en ${appDomain}`
  }
}

async function sendDailySummary() {
  try {
    // Verify that WhatsApp is connected
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
        // Usar LID si está disponible, sino usar phone
        const jid = user.lid
          ? `${user.lid}@lid`
          : `${user.phone}@s.whatsapp.net`

        await sock.sendMessage(jid, {
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

  // On startup: check if we need to refresh cache
  isCacheRecent().then(async (isRecent) => {
    if (isRecent) {
      logger.info('📦 Cache is recent (<30 min), skipping initial refresh')
    } else {
      logger.info('🔄 Cache is old or missing, refreshing...')
      try {
        await refreshSummary()
        logger.info('✅ Initial refresh completed successfully')
      } catch (err) {
        logger.error('Initial refresh error:', err.message || err)
        logger.error('Stack trace:', err.stack)
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
