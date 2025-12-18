import { getSummary } from '../services/ai-summarizer.js'
import { logger } from '../utils/logger.js'
import { sendMessage } from '../services/whatsapp.js'
import User from '../models/User.js'

// Format articles array for WhatsApp (only PRINCIPALES category)
function formatWhatsAppMessage(articles) {
  const appDomain = process.env.APP_DOMAIN
  const appUrl = `https://${appDomain}`

  // Filter PRINCIPALES category
  const principales = articles.filter((art) => art.category === 'PRINCIPALES')

  if (principales.length === 0) {
    return `*RSMN - Noticias del día*\n\nNo hay noticias principales disponibles.\n\n📱 Más noticias en ${appUrl}`
  }

  // Format each article - LIMIT TO 5 to keep message short
  const bullets = principales
    .slice(0, 5)
    .map((art, idx) => {
      // Truncate description if too long
      const maxDescLength = 120
      const desc =
        art.description.length > maxDescLength
          ? art.description.substring(0, maxDescLength) + '...'
          : art.description

      return `${idx + 1}. *${art.title}*\n${desc}`
    })
    .join('\n\n')

  return `*📰 RSMN - Top 5 del día*\n\n${bullets}\n\n📱 Más en ${appUrl}`
}

const commands = {
  // Actualización manual
  async actualizame(sock, from) {
    try {
      const articles = await getSummary() // Returns array

      if (!Array.isArray(articles) || articles.length === 0) {
        await sendMessage(
          from,
          '❌ No hay noticias disponibles. Intenta más tarde.'
        )
        return
      }

      const whatsappMessage = formatWhatsAppMessage(articles)
      await sendMessage(from, whatsappMessage)
      logger.info(`✅ Summary sent to ${from}`)
    } catch (error) {
      logger.error('Error sending summary:', error)
      await sendMessage(
        from,
        '❌ Error al obtener noticias. Intenta nuevamente.'
      )
    }
  },

  // Suscripción
  async suscribir(sock, from, phone, lid) {
    try {
      await User.findOneAndUpdate(
        { phone },
        { $set: { subscribed: true, lid } },
        { upsert: true, new: true }
      )

      await sendMessage(
        from,
        '✅ ¡Listo! Recibirás un resumen de noticias todos los días a las 6:00 AM.\n\nComandos disponibles:\n• "pausar" - pausar suscripción\n• "reanudar" - reanudar suscripción\n• "actualizame" - Te envío las últimas noticias'
      )
    } catch (error) {
      logger.error('Error subscribing user:', error)
      await sendMessage(from, '❌ Error al suscribir. Intenta nuevamente.')
    }
  },

  // Pausar suscripción
  async pausar(sock, from, phone) {
    try {
      const result = await User.updateOne(
        { phone },
        { $set: { subscribed: false } }
      )

      if (result.matchedCount === 0) {
        await sendMessage(
          from,
          '❌ No estás suscripto. Usa "suscribir" primero.'
        )
        return
      }

      await sendMessage(
        from,
        '⏸️ Suscripción pausada. Usa "reanudar" para volver a activarla.'
      )
    } catch (error) {
      await sendMessage(from, '❌ Error al pausar. Intenta nuevamente.')
    }
  },

  // Reanudar suscripción
  async reanudar(sock, from, phone) {
    try {
      const result = await User.updateOne(
        { phone },
        { $set: { subscribed: true } }
      )

      if (result.matchedCount === 0) {
        await sendMessage(
          from,
          '❌ No estás suscripto. Usa "suscribir" primero.'
        )
        return
      }

      await sendMessage(
        from,
        '▶️ ¡Suscripción reactivada! Volverás a recibir noticias a las 6:00 AM.'
      )
    } catch (error) {
      await sendMessage(from, '❌ Error al reanudar. Intenta nuevamente.')
    }
  },

  // Dar de baja (eliminar de la base de datos)
  async baja(sock, from, phone) {
    try {
      const result = await User.deleteOne({ phone })

      if (result.deletedCount === 0) {
        await sendMessage(from, '❌ No estás registrado en el sistema.')
        return
      }

      await sendMessage(
        from,
        '👋 Te diste de baja correctamente. Si querés volver, escribí "suscribir".'
      )
      logger.info(`User ${phone} unsubscribed and deleted`)
    } catch (error) {
      await sendMessage(from, '❌ Error al dar de baja. Intenta nuevamente.')
    }
  },

  // Ayuda
  async ayuda(sock, from) {
    try {
      await sendMessage(
        from,
        'RSMN - Comandos: actualizame, suscribir, pausar, reanudar, baja, ayuda'
      )
    } catch (error) {
      logger.error(`Error en ayuda: ${error.message}`)
    }
  },
}

export async function handleIncomingMessage(sock, from, text, phone, lid) {
  const command = text.toLowerCase().trim()
  logger.info(`Comando recibido: "${command}" de ${phone}`)

  if (commands[command]) {
    await commands[command](sock, from, phone, lid)
  } else if (
    command.includes('hola') ||
    command.includes('ayuda') ||
    command === 'help'
  ) {
    await commands.ayuda(sock, from)
  } else {
    await sendMessage(
      from,
      '❓ Comando no reconocido. Usa "ayuda" para ver comandos disponibles.'
    )
  }
}
