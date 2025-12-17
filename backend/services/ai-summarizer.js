import OpenAI from 'openai'
import { logger } from '../utils/logger.js'
import NewsCache from '../models/NewsCache.js'
import { scrapeAllPortals, scrapeArticle } from './scraper.js'

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

1. ESTRUCTURA: Primero una sección PRINCIPALES, luego si o si 9 categorías:

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

2. FORMATO: Usá este formato exacto (INCLUIR URL debajo de cada noticia):
   ## NOMBRE_CATEGORIA
   - Título de la noticia: Descripción breve y clara de la noticia.
   [URL_DE_LA_NOTICIA]
   - Otra noticia: Descripción de esta otra noticia.
   [URL_DE_LA_NOTICIA]

3. CONTENIDO:
   - PRINCIPALES: Exactamente 5 noticias (las más relevantes del día)
   - Otras categorías: Máximo 3 noticias cada una
   - Cada noticia tiene: Título corto + dos puntos + descripción + URL en línea siguiente entre []
   - Frases directas, sin rodeos
   - Si no hay noticias de una categoría, omitila (excepto PRINCIPALES)

4. PROHIBIDO:
   - NO uses emojis ni iconos
   - NO uses asteriscos ni formato markdown excepto ## para categorías y [] para URLs
   - NO repitas noticias en más de una categoría (excepto PRINCIPALES)

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

// Explain article in informal/casual tone
export async function explainArticle(title, content) {
  try {
    const EXPLAIN_PROMPT = `Sos un periodista argentino que explica noticias de forma clara y accesible para cualquier persona.

Tu objetivo es explicar la noticia de manera que cualquiera la entienda, sin perder profesionalismo.

TONO Y ESTILO:
- Profesional pero cercano (NO uses "che", "boludo" ni exceso de lunfardo)
- Mantené neutralidad política absoluta
- Podés usar palabras coloquiales como "guita", "quilombo" si ayudan a clarificar
- Explicá conceptos técnicos/políticos de forma simple, con ejemplos concretos

FORMATO VISUAL (MUY IMPORTANTE):
- PROHIBIDO usar markdown: NO uses #, ##, ###, **, __, etc.
- Los títulos/subtítulos se hacen SOLO con emojis + texto plano
- Ejemplo correcto: "🧉 ¿Qué dijo X, básicamente?" o "💸 ¿Por qué no juntaron reservas?"
- Usá bullets con símbolos por ejemplo estos: 👉, •, ✅, ❌ (NO uses - o * para bullets)
- Frases cortas y directas
- Líneas en blanco entre secciones para respirar

ESTRUCTURA:
- Dividí en bloques temáticos con preguntas como subtítulos
- Cada sección empieza con emoji + pregunta o título descriptivo
- Usá bullets para listar puntos clave
- Cerrá con un resumen corto de lo más importante

CONTENIDO:
- Explicá los hechos principales de forma clara
- Traducí/aclará entre paréntesis lo que sea complejo
- Ejemplos concretos cuando ayude

Devolvé SOLO la explicación en texto plano con emojis, sin markdown.`

    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: EXPLAIN_PROMPT },
        {
          role: 'user',
          content: `Título: ${title}\n\nContenido:\n${content.substring(
            0,
            3000
          )}`, // Limitar para evitar exceso de tokens
        },
      ],
      temperature: 0.8, // Más creativo para el tono informal
      max_tokens: 1000,
    })

    const explanation = response.choices[0].message.content
    return explanation
  } catch (error) {
    logger.error('Error explaining article:', error)
    return null // Si falla, no bloquear todo
  }
}

// Extract URLs from the summary markdown
function extractUrlsFromSummary(summary) {
  const urls = []
  // Search for [URL] in the markdown
  const urlRegex = /\[(https?:\/\/[^\]]+)\]/g
  let match
  while ((match = urlRegex.exec(summary)) !== null) {
    urls.push(match[1])
  }
  return [...new Set(urls)] // Deduplicate
}

// Check if the cache is recent (less than 30 minutes)
export async function isCacheRecent() {
  const cached = await NewsCache.findOne().sort({ createdAt: -1 })

  if (!cached) return false

  const cacheAge = Date.now() - new Date(cached.createdAt).getTime()
  const thirtyMinutes = 30 * 60 * 1000
  return cacheAge < thirtyMinutes
}

// Get the latest cached summary (for users)
export async function getSummary() {
  try {
    const cached = await NewsCache.findOne().sort({ createdAt: -1 })

    if (cached) {
      const cacheAge = Date.now() - new Date(cached.createdAt).getTime()
      const minutes = Math.floor(cacheAge / 60000)
      logger.info(`📦 Using cached summary (${minutes} min old)`)
      return cached.summary
    }

    // If no cache, generate one (only the first time)
    logger.info('⚠️ No cache found, generating first summary...')
    return await refreshSummary()
  } catch (error) {
    logger.error('Error getting summary:', error)
    throw new Error('No se pudo obtener resumen de noticias')
  }
}

// Refresh the cache (only for cron jobs)
export async function refreshSummary() {
  try {
    logger.info('🔄 Refreshing news cache...')

    // Scrape fresh content
    const scrapedData = await scrapeAllPortals()

    // Collect all articles
    const allArticles = []
    scrapedData.forEach((portalData) => {
      if (!portalData.error && portalData.articles) {
        allArticles.push(...portalData.articles)
      }
    })

    if (allArticles.length === 0) {
      throw new Error('No articles scraped from portals')
    }

    logger.info(`📰 Collected ${allArticles.length} articles`)

    // Formatting articles for OpenAI (only include content if it exists)
    const combinedContent = allArticles
      .map((article) => {
        const parts = [`[${article.portal}] ${article.title}`]
        if (article.content) {
          parts.push(article.content)
        }
        parts.push(`URL: ${article.url}`)
        return parts.join('\n')
      })
      .join('\n\n---\n\n')

    // Generate summary with AI
    const summary = await summarizeContent(combinedContent)

    // Extract URLs from the generated summary
    const selectedUrls = extractUrlsFromSummary(summary)
    logger.info(`🔗 Summary contains ${selectedUrls.length} article URLs`)

    // Scrape full content of selected articles
    const fullArticles = []
    if (selectedUrls.length > 0) {
      logger.info('📥 Fetching full content for selected articles...')
      const articlePromises = selectedUrls.map((url) => scrapeArticle(url))
      const scrapedArticles = await Promise.all(articlePromises)

      // Process each article and generate explanation IN PARALLEL
      logger.info(
        `🤖 Explaining ${scrapedArticles.length} articles in parallel...`
      )
      const explanationPromises = scrapedArticles.map(async (article) => {
        if (article.error || !article.content) {
          return null
        }

        const portalName = new URL(article.url).hostname.replace('www.', '')

        // Generate informal explanation with AI
        logger.info(`🤖 Explaining: ${article.title.substring(0, 50)}...`)
        const explained = await explainArticle(article.title, article.content)

        return {
          title: article.title,
          url: article.url,
          content: article.content,
          portal: portalName,
          explained: explained || 'Explicación no disponible 🤷',
        }
      })

      const results = await Promise.all(explanationPromises)
      fullArticles.push(...results.filter((article) => article !== null))

      logger.info(
        `✅ Fetched and explained ${fullArticles.length}/${selectedUrls.length} articles`
      )
    }

    // Save to cache with full articles
    await NewsCache.create({
      summary,
      articles: fullArticles, // Full articles, not the original 160
      rawContent: combinedContent.substring(0, 50000), // Keep for backward compatibility
    })

    // Clean old cache (keep only the last 10)
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
