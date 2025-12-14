import { getSummary } from '../services/ai-summarizer.js'
import { logger } from '../utils/logger.js'

// Extraer número de teléfono limpio del JID de WhatsApp
function extractPhone(jid) {
  return jid.split('@')[0]
}

// Extraer las 6 principales noticias y formatear para WhatsApp
function formatWhatsAppMessage(summary) {
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
    return `*RSMN - Las noticias del día*\n\n${bullets}\n\n📱 Más noticias en rsmn.ar`
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

  return `*RSMN - Las noticias del día*\n\n${bullets}\n\n📱 Más noticias en rsmn.ar`
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
  async suscribir(sock, from) {
    try {
      const phone = extractPhone(from)

      await db.user.upsert({
        where: { phone },
        update: { subscribed: true },
        create: {
          phone,
          subscribed: true,
          isPaid: false,
        },
      })

      await sock.sendMessage(from, {
        text: '✅ ¡Listo! Recibirás un resumen de noticias todos los días a las 6:00 AM.\n\nComandos disponibles:\n• "pausar" - pausar suscripción\n• "reanudar" - reanudar suscripción\n• "actualizame" - resumen ahora',
      })
    } catch (error) {
      logger.error('Error subscribing user:', error)
      await sock.sendMessage(from, {
        text: '❌ Error al suscribir. Intenta nuevamente.',
      })
    }
  },

  // Pausar suscripción
  async pausar(sock, from) {
    try {
      const phone = extractPhone(from)

      await db.user.update({
        where: { phone },
        data: { subscribed: false },
      })

      await sock.sendMessage(from, {
        text: '⏸️ Suscripción pausada. Usa "reanudar" para volver a activarla.',
      })
    } catch (error) {
      await sock.sendMessage(from, {
        text: '❌ No estás suscripto. Usa "suscribir" primero.',
      })
    }
  },

  // Reanudar suscripción
  async reanudar(sock, from) {
    try {
      const phone = extractPhone(from)

      await db.user.update({
        where: { phone },
        data: { subscribed: true },
      })

      await sock.sendMessage(from, {
        text: '▶️ ¡Suscripción reactivada! Volverás a recibir noticias a las 6:00 AM.',
      })
    } catch (error) {
      await sock.sendMessage(from, {
        text: '❌ No estás suscripto. Usa "suscribir" primero.',
      })
    }
  },

  // Dar de baja (eliminar de la base de datos)
  async baja(sock, from) {
    try {
      const phone = extractPhone(from)

      await db.user.delete({
        where: { phone },
      })

      await sock.sendMessage(from, {
        text: '👋 Te diste de baja correctamente. Si querés volver, escribí "suscribir".',
      })
      logger.info(`User ${phone} unsubscribed and deleted`)
    } catch (error) {
      await sock.sendMessage(from, {
        text: '❌ No estás registrado en el sistema.',
      })
    }
  },

  // Ayuda
  async ayuda(sock, from) {
    const helpText = `*RSMN - Comandos disponibles*

• *actualizame* - Resumen de noticias ahora
• *suscribir* - Noticias diarias a las 6 AM
• *pausar* - Pausar envíos
• *reanudar* - Reactivar suscripción
• *baja* - Eliminar suscripción
• *ayuda* - Ver este mensaje`

    await sock.sendMessage(from, { text: helpText })
  },
}

export async function handleIncomingMessage(sock, from, text) {
  const command = text.toLowerCase().trim()

  if (commands[command]) {
    await commands[command](sock, from)
  } else if (
    command.includes('hola') ||
    command.includes('ayuda') ||
    command === 'help'
  ) {
    await commands.ayuda(sock, from)
  } else {
    await sock.sendMessage(from, {
      text: '❓ Comando no reconocido. Usa "ayuda" para ver comandos disponibles.',
    })
  }
}
