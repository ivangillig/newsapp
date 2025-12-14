import pino from 'pino'

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
})

// Logger silencioso para Baileys (evita logs de debug de Signal Protocol)
export const baileysLogger = pino({
  level: 'silent',
})
