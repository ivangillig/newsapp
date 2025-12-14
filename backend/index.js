import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { initWhatsApp } from './services/whatsapp.js'
import { startCronJobs } from './jobs/daily-sender.js'
import apiRoutes from './routes/api.js'
import { logger } from './utils/logger.js'
import { connectDB } from './config/database.js'

dotenv.config()
const app = express()
const PORT = process.env.PORT || 3001

// Middleware
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  })
)
app.use(express.json())

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// API Routes
app.use('/api', apiRoutes)

// Initialize services
async function startServer() {
  try {
    // Connect to MongoDB
    logger.info('🔌 Connecting to MongoDB...')
    await connectDB()

    // Start Express server
    app.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT}`)
    })

    // Initialize WhatsApp
    logger.info('🔄 Initializing WhatsApp...')
    await initWhatsApp()
    logger.info('✅ WhatsApp ready')

    // Start cron jobs
    startCronJobs()
    logger.info('⏰ Cron jobs started')
  } catch (error) {
    logger.error('Failed to start server:', error)
    process.exit(1)
  }
}

startServer()
