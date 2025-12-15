import { getSummary } from '../services/ai-summarizer.js'
import { logger } from '../utils/logger.js'
import User from '../models/User.js'

// Extraer las 6 principales noticias y formatear para WhatsApp
function formatWhatsAppMessage(summary) {
  const appDomain = process.env.APP_DOMAIN
  const appUrl = `https://${appDomain}`

  // Buscar la sección PRINCIPALES
  const principalesMatch = summary.match(
    /## PRINCIPALES([\s\S]*?)(?=## [A-ZÁÉÍÓÚ]|$)/
  )

  if (!principalesMatch) {
    // Fallback: tomar las primeras 6 líneas que empiecen con -
    const lines = summary
      .split('\n')
      .filter((l) => l.trim().startsWith('-'))
      .slice(0, 6)
    const bullets = lines
      .map((l) => `• ${l.replace(/^-\s*/, '').trim()}`)
      .join('\n\n')
    return `*RSMN - Las noticias del día*\n\n${bullets}\n\n📱 Más noticias en ${appUrl}`
  }

  // Parsear las noticias principales
  const principalesText = principalesMatch[1]
  const newsLines = principalesText
    .split('\n')
    .filter((l) => l.trim().startsWith('-'))
    .slice(0, 6)
    .map((l) => {
      const text = l.replace(/^-\s*/, '').trim()
      // Formato: "Título: descripción" -> "• TÍTULO: descripción"
      const colonIndex = text.indexOf(':')
      if (colonIndex > 0 && colonIndex < 50) {
        const titulo = text.substring(0, colonIndex).trim().toUpperCase()
        const desc = text.substring(colonIndex + 1).trim()
        return `• *${titulo}:* ${desc}`
      }
      return `• ${text}`
    })

  const bullets = newsLines.join('\n\n')

  return `*RSMN - Las noticias del día*\n\n${bullets}\n\n📱 Más noticias en ${appUrl}`
}

const commands = {
  // Actualización manual
  async actualizame(sock, from) {
    try {
      const summary = await getSummary()
      const whatsappMessage = formatWhatsAppMessage(summary)

      await sock.sendMessage(from, { text: whatsappMessage })
      logger.info(`✅ Summary sent to ${from}`)
    } catch (error) {
      logger.error('Error sending summary:', error)
      await sock.sendMessage(from, {
        text: '❌ Error al obtener noticias. Intenta nuevamente.',
      })
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

      await sock.sendMessage(from, {
        text: '✅ ¡Listo! Recibirás un resumen de noticias todos los días a las 6:00 AM.\n\nComandos disponibles:\n• "pausar" - pausar suscripción\n• "reanudar" - reanudar suscripción\n• "actualizame" - Te envío las últimas noticias',
      })
    } catch (error) {
      logger.error('Error subscribing user:', error)
      await sock.sendMessage(from, {
        text: '❌ Error al suscribir. Intenta nuevamente.',
      })
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
        await sock.sendMessage(from, {
          text: '❌ No estás suscripto. Usa "suscribir" primero.',
        })
        return
      }

      await sock.sendMessage(from, {
        text: '⏸️ Suscripción pausada. Usa "reanudar" para volver a activarla.',
      })
    } catch (error) {
      await sock.sendMessage(from, {
        text: '❌ Error al pausar. Intenta nuevamente.',
      })
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
        await sock.sendMessage(from, {
          text: '❌ No estás suscripto. Usa "suscribir" primero.',
        })
        return
      }

      await sock.sendMessage(from, {
        text: '▶️ ¡Suscripción reactivada! Volverás a recibir noticias a las 6:00 AM.',
      })
    } catch (error) {
      await sock.sendMessage(from, {
        text: '❌ Error al reanudar. Intenta nuevamente.',
      })
    }
  },

  // Dar de baja (eliminar de la base de datos)
  async baja(sock, from, phone) {
    try {
      const result = await User.deleteOne({ phone })

      if (result.deletedCount === 0) {
        await sock.sendMessage(from, {
          text: '❌ No estás registrado en el sistema.',
        })
        return
      }

      await sock.sendMessage(from, {
        text: '👋 Te diste de baja correctamente. Si querés volver, escribí "suscribir".',
      })
      logger.info(`User ${phone} unsubscribed and deleted`)
    } catch (error) {
      await sock.sendMessage(from, {
        text: '❌ Error al dar de baja. Intenta nuevamente.',
      })
    }
  },

  // Ayuda
  async ayuda(sock, from) {
    logger.info(`Ejecutando comando ayuda para ${from}`)
    try {
      const helpText =
        'RSMN - Comandos: actualizame, suscribir, pausar, reanudar, baja, ayuda'
      logger.info(`Enviando mensaje de ayuda...`)
      await sock.sendMessage(from, { text: helpText })
      logger.info(`Mensaje de ayuda enviado OK`)
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
    logger.info(`Comando no reconocido, enviando respuesta default...`)
    await sock.sendMessage(from, {
      text: '❓ Comando no reconocido. Usa "ayuda" para ver comandos disponibles.',
    })
    logger.info(`Respuesta default enviada OK`)
  }
}
