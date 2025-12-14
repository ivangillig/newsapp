import OpenAI from 'openai'
import { logger } from '../utils/logger.js'
import NewsCache from '../models/NewsCache.js'
import { scrapeAllPortals } from './scraper.js'

// Lazy initialization - se crea cuando se usa, no al importar
let openai = null

function getOpenAI() {
  if (!openai) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  }
  return openai
}

const SYSTEM_PROMPT = `Sos un analista de noticias experto argentino.
Te paso contenido crudo de portales de noticias. Tu tarea es generar un resumen ejecutivo.

REGLAS ESTRICTAS:

1. ESTRUCTURA: Primero una sección PRINCIPALES, luego 9 categorías:

   ## PRINCIPALES
   (Las 5 noticias más importantes del día, sin importar categoría)
   
   ## POLÍTICA
   ## ECONOMÍA  
   ## SOCIEDAD
   ## MUNDO
   ## DEPORTES
   ## TECNOLOGÍA
   ## ESPECTÁCULOS
   ## POLICIALES
   ## CLIMA

2. FORMATO: Usá este formato exacto:
   ## NOMBRE_CATEGORIA
   - Título de la noticia: Descripción breve y clara de la noticia.
   - Otra noticia: Descripción de esta otra noticia.

3. CONTENIDO:
   - PRINCIPALES: Exactamente 5 noticias (las más relevantes del día)
   - Otras categorías: Máximo 3 noticias cada una
   - Cada noticia tiene: Título corto + dos puntos + descripción
   - Frases directas, sin rodeos
   - Si no hay noticias de una categoría, omitila (excepto PRINCIPALES)

4. PROHIBIDO:
   - NO uses emojis ni iconos
   - NO uses asteriscos ni formato markdown excepto ## para categorías
   - NO repitas información entre PRINCIPALES y otras categorías

5. TONO: Informal-profesional, como explicárselo a alguien inteligente con poco tiempo.

Devolvé SOLO el resumen, sin introducciones ni despedidas.`

export async function summarizeContent(rawContent) {
  try {
    logger.info('🤖 Generating summary with OpenAI...')

    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: rawContent },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    })

    const summary = response.choices[0].message.content

    logger.info(`✅ Summary generated (${summary.length} characters)`)

    return summary
  } catch (error) {
    logger.error('Error generating summary:', error)
    throw error
  }
}

// Verificar si el cache es reciente (menos de 30 minutos)
export async function isCacheRecent() {
  const cached = await NewsCache.findOne().sort({ createdAt: -1 })

  if (!cached) return false

  const cacheAge = Date.now() - new Date(cached.createdAt).getTime()
  const thirtyMinutes = 30 * 60 * 1000
  return cacheAge < thirtyMinutes
}

// Obtener el último resumen cacheado (para usuarios)
export async function getSummary() {
  try {
    const cached = await NewsCache.findOne().sort({ createdAt: -1 })

    if (cached) {
      const cacheAge = Date.now() - new Date(cached.createdAt).getTime()
      const minutes = Math.floor(cacheAge / 60000)
      logger.info(`📦 Using cached summary (${minutes} min old)`)
      return cached.summary
    }

    // Si no hay cache, generar uno (solo la primera vez)
    logger.info('⚠️ No cache found, generating first summary...')
    return await refreshSummary()
  } catch (error) {
    logger.error('Error getting summary:', error)
    throw new Error('No se pudo obtener resumen de noticias')
  }
}

// Refrescar el cache (solo para cron jobs)
export async function refreshSummary() {
  try {
    logger.info('🔄 Refreshing news cache...')

    // Scrape fresh content
    const scrapedData = await scrapeAllPortals()

    // Combine all content
    const combinedContent = scrapedData
      .filter((s) => !s.error && s.content)
      .map((s) => `=== ${s.url} ===\n${s.content}`)
      .join('\n\n---\n\n')

    if (!combinedContent) {
      throw new Error('No content scraped from portals')
    }

    // Generate summary with AI
    const summary = await summarizeContent(combinedContent)

    // Save to cache
    await NewsCache.create({
      summary,
      rawContent: combinedContent.substring(0, 50000),
    })

    // Limpiar cache viejo (mantener solo últimos 10)
    const allCache = await NewsCache.find().sort({ createdAt: -1 }).skip(10)

    if (allCache.length > 0) {
      await NewsCache.deleteMany({
        _id: { $in: allCache.map((c) => c._id) },
      })
      logger.info(`🗑️ Cleaned ${allCache.length} old cache entries`)
    }

    logger.info('✅ News cache refreshed successfully')
    return summary
  } catch (error) {
    logger.error('Error refreshing summary:', error)

    // Devolver último cache como fallback
    const lastCache = await NewsCache.findOne().sort({ createdAt: -1 })

    if (lastCache) {
      logger.info('⚠️ Returning last cached summary due to error')
      return lastCache.summary
    }

    throw new Error('No se pudo refrescar el resumen de noticias')
  }
}
