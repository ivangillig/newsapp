import mongoose from 'mongoose'
import { logger } from '../utils/logger.js'

let isConnected = false

export async function connectDB() {
  if (isConnected) {
    return
  }

  try {
    const mongoUri =
      process.env.MONGODB_URI || 'mongodb://localhost:27017/news-app'

    await mongoose.connect(mongoUri)
    isConnected = true
    logger.info('✅ MongoDB connected')
  } catch (error) {
    logger.error('❌ MongoDB connection error:', error)
    throw error
  }
}
