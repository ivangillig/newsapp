import express from 'express'
import { getSummary } from '../services/ai-summarizer.js'
import { sendMessage, getWhatsAppClient } from '../services/whatsapp.js'
import { logger } from '../utils/logger.js'
import User from '../models/User.js'
import NewsCache from '../models/NewsCache.js'

const router = express.Router()

// Get latest summary (siempre desde cache)
router.get('/summary', async (req, res) => {
  try {
    const summary = await getSummary()

    // Obtener timestamp del cache
    const cached = await NewsCache.findOne()
      .sort({ createdAt: -1 })
      .select('createdAt')

    res.json({
      success: true,
      summary,
      cachedAt: cached?.createdAt || new Date().toISOString(),
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    logger.error('Error getting summary:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get news summary',
    })
  }
})

// Subscribe endpoint (for web form)
router.post('/subscribe', async (req, res) => {
  try {
    const { phone, email } = req.body

    if (!phone) {
      return res.status(400).json({
        success: false,
        error: 'Phone number required',
      })
    }

    // Clean phone number (remove spaces, dashes, etc.)
    const cleanPhone = phone.replace(/\D/g, '')

    const user = await User.findOneAndUpdate(
      { phone: cleanPhone },
      {
        $set: {
          subscribed: true,
          email: email || null,
        },
        $setOnInsert: {
          phone: cleanPhone,
          isPaid: false,
        },
      },
      { upsert: true, new: true }
    )

    // Enviar confirmación por WhatsApp
    try {
      const whatsappId = `${cleanPhone}@s.whatsapp.net`
      await sendMessage(
        whatsappId,
        `¡Hola! Te suscribiste a *RSMN* 📰\n\nRecibirás un resumen de noticias todos los días a las 6:00 AM.\n\nComandos disponibles:\n• "actualizame" - Te envío las últimas noticias\n• "pausar" - Pausar envíos\n• "baja" - Cancelar suscripción`
      )
      logger.info(`WhatsApp confirmation sent to ${cleanPhone}`)
    } catch (whatsappError) {
      logger.warn(
        `Could not send WhatsApp confirmation: ${whatsappError.message}`
      )
    }

    res.json({
      success: true,
      message:
        'Successfully subscribed! You will receive a confirmation on WhatsApp.',
      user: {
        phone: user.phone,
        subscribed: user.subscribed,
      },
    })
  } catch (error) {
    logger.error('Error subscribing user:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to subscribe',
    })
  }
})

// Unsubscribe endpoint (for web)
router.post('/unsubscribe', async (req, res) => {
  try {
    const { phone } = req.body

    if (!phone) {
      return res.status(400).json({
        success: false,
        error: 'Phone number required',
      })
    }

    const cleanPhone = phone.replace(/\D/g, '')

    await User.deleteOne({ phone: cleanPhone })

    // Enviar confirmación por WhatsApp
    try {
      const whatsappId = `${cleanPhone}@s.whatsapp.net`
      await sendMessage(
        whatsappId,
        `Te diste de baja de *RSMN*.\n\nSi querés volver, escribí "suscribir" o visitá nuestra web.`
      )
    } catch (whatsappError) {
      logger.warn(
        `Could not send WhatsApp unsubscribe confirmation: ${whatsappError.message}`
      )
    }

    res.json({
      success: true,
      message: 'Successfully unsubscribed',
    })
  } catch (error) {
    logger.error('Error unsubscribing user:', error)
    res.status(500).json({
      success: false,
      error: 'User not found or already unsubscribed',
    })
  }
})

// Get subscriber stats (admin endpoint - add auth later)
router.get('/stats', async (req, res) => {
  try {
    const totalUsers = await User.countDocuments()
    const activeSubscribers = await User.countDocuments({ subscribed: true })
    const paidUsers = await User.countDocuments({ isPaid: true })

    res.json({
      success: true,
      stats: {
        totalUsers,
        activeSubscribers,
        paidUsers,
        freeUsers: activeSubscribers - paidUsers,
      },
    })
  } catch (error) {
    logger.error('Error getting stats:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get stats',
    })
  }
})

export default router
