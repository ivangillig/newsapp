import OpenAI from 'openai'
import { logger } from '../utils/logger.js'
import NewsCache from '../models/NewsCache.js'
import { scrapeAllPortals, scrapeArticle } from './scraper.js'

// Lazy initialization - created when used, not on import
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
Te paso una lista de artículos scrapeados de portales. Tu tarea es seleccionar y categorizar los más importantes.

ESTRUCTURA JSON REQUERIDA:
{
  "categories": [
    {
      "name": "PRINCIPALES",
      "urls": ["https://...", "https://...", ...]
    },
    {
      "name": "POLÍTICA",
      "urls": ["https://...", ...]
    }
    // ... demás categorías
  ]
}

REGLAS ESTRICTAS:

1. CATEGORÍAS DISPONIBLES (en este orden):
   - PRINCIPALES (exactamente 5 URLs - las noticias más relevantes del día, solo para WhatsApp)
   - POLÍTICA
   - ECONOMÍA
   - MUNDO
   - CIENCIA Y TECNOLOGÍA
   - SOCIEDAD
   - DEPORTES
   - ESPECTÁCULOS
   - SEGURIDAD Y DEFENSA (incluye: crimen, ataques militares, defensa nacional, violencia, robos, narcotráfico, etc.)
   - CLIMA

2. SELECCIÓN POR CATEGORÍA (MUY IMPORTANTE):
   - PRINCIPALES: Exactamente 5 URLs (las más importantes del día, solo para WhatsApp)
   - TODAS las demás categorías: MÍNIMO 3 URLs, MÁXIMO 4 URLs cada una
   - Si una categoría no tiene 3 noticias relevantes, buscar más relacionadas
   - OBJETIVO TOTAL: Aproximadamente 30 o 35 artículos (sin contar PRINCIPALES)
   - Las URLs de PRINCIPALES SÍ DEBEN repetirse en sus categorías correspondientes
   - Solo seleccioná URLs que realmente existan en la lista que te paso
   - SÉ AGRESIVO: Incluí todas las noticias interesantes, no seas conservador
   - Ejemplo: Si hay noticias de F1, fútbol, tenis → todas van a DEPORTES hasta completar 4
   - Ejemplo: Ataques militares, narcotráfico, robos → SEGURIDAD Y DEFENSA hasta completar 4

3. IMPORTANTE:
   - Devolvé SOLO las URLs, no títulos ni descripciones
   - Las URLs deben estar completas (https://...)
   - SIEMPRE 4 URLs por categoría (excepto PRINCIPALES que son 5)
   - Si una categoría parece tener pocas noticias, buscá más profundo en la lista
   - OBJETIVO: 9 categorías × 4 artículos = 36 artículos totales
   - Ejemplo deportes: F1 + fútbol + tenis + básquet = 4 noticias
   - Ejemplo seguridad: crimen + narcotráfico + ataques + robos = 4 noticias

Devolvé SOLO el objeto JSON con las URLs categorizadas.`

// Select and categorize articles with AI
export async function selectArticles(rawContent) {
  try {
    logger.info('🤖 Selecting articles with OpenAI...')

    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: rawContent },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.8, // Increased to be more creative in selection
      max_tokens: 4000, // Increased for more articles
    })

    const selection = response.choices[0].message.content

    // Validate that it's valid JSON
    try {
      JSON.parse(selection)
      logger.info(
        `✅ Article selection generated (${selection.length} characters)`
      )
    } catch (parseError) {
      logger.error('❌ Invalid JSON from OpenAI:', selection.substring(0, 200))
      throw new Error('OpenAI returned invalid JSON for article selection')
    }

    return selection
  } catch (error) {
    logger.error('Error selecting articles:', error)
    throw error
  }
}

// Process article: generate optimized title, description, and explanation in ONE call
export async function processArticle(title, content) {
  try {
    const PROCESS_PROMPT = `Sos un periodista argentino que procesa noticias para un resumen informativo.

Recibís el título original y el contenido de una noticia. Debés devolver SOLO un JSON con:
1. "title": título optimizado (máx 80 chars, claro, sin clickbait, sin nombre del portal)
2. "description": resumen corto de 1-2 líneas (qué pasó, quién, cuándo) - máx 150 chars
3. "explained": explicación informal para que cualquiera entienda la noticia

PARA "explained" - TONO Y ESTILO:
- Profesional pero cercano (NO uses "che", "boludo" ni exceso de lunfardo)
- Mantené neutralidad política absoluta
- Podés usar palabras coloquiales como "guita", "quilombo" si ayudan a clarificar

PARA "explained" - FORMATO VISUAL (MUY IMPORTANTE):
- PROHIBIDO usar markdown: NO uses #, ##, ###, **, __, etc.
- Los títulos/subtítulos se hacen SOLO con emojis + texto plano
- Ejemplo correcto: "🧉 ¿Qué dijo X, básicamente?" o "💸 ¿Por qué no juntaron reservas?"
- Usá bullets con símbolos como: 👉, •, ✅, ❌ (NO uses - o * para bullets)
- Frases cortas y directas
- Líneas en blanco entre secciones para respirar

ESTRUCTURA del "explained":
- Dividí en bloques temáticos con preguntas como subtítulos
- Cada sección empieza con emoji + pregunta o título descriptivo
- Usá bullets para listar puntos clave
- Cerrá con un resumen corto de lo más importante

Devolvé SOLO un JSON válido con esta estructura:
{
  "title": "Título optimizado",
  "description": "Resumen corto de la noticia",
  "explained": "Explicación completa en texto plano con emojis"
}`

    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: PROCESS_PROMPT },
        {
          role: 'user',
          content: `Título original: ${title}\n\nContenido:\n${content.substring(
            0,
            4000
          )}`,
        },
      ],
      temperature: 0.7,
      max_tokens: 2500,
      response_format: { type: 'json_object' },
    })

    const result = JSON.parse(response.choices[0].message.content)
    return {
      title: result.title || title, // Fallback to original
      description: result.description || 'Sin descripción disponible',
      explained: result.explained || 'Explicación no disponible',
    }
  } catch (error) {
    logger.error('Error processing article:', error.message)
    // Return valid fallback to not break the flow
    return {
      title: title.substring(0, 80),
      description: 'Resumen no disponible temporalmente',
      explained: 'La explicación no pudo ser generada en este momento.',
    }
  }
}

// DEPRECATED - Use processArticle() instead
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
          )}`, // Limit to avoid token excess
        },
      ],
      temperature: 0.8, // More creative for informal tone
      max_tokens: 1000,
    })

    const explanation = response.choices[0].message.content
    return explanation
  } catch (error) {
    logger.error('Error explaining article:', error)
    return null // If it fails, don't block everything
  }
}

// Extract URLs and categories from selection JSON
function extractSelections(selectionJson) {
  try {
    const data = JSON.parse(selectionJson)
    const selections = []

    data.categories.forEach((category) => {
      const categoryName = category.name

      // Include ALL categories, including PRINCIPALES
      // Filtering for UI is done in the frontend
      category.urls.forEach((url) => {
        selections.push({ url, category: categoryName })
      })
    })

    logger.info(
      `🔗 Extracted ${selections.length} URLs from all categories (including PRINCIPALES)`
    )
    return selections
  } catch (error) {
    logger.error('Error parsing selection JSON:', error)
    return []
  }
}

// Check if the cache is recent (less than 30 minutes)
export async function isCacheRecent() {
  const cached = await NewsCache.findOne().sort({ createdAt: -1 })

  if (!cached) return false

  const cacheAge = Date.now() - new Date(cached.createdAt).getTime()
  const thirtyMinutes = 30 * 60 * 1000
  return cacheAge < thirtyMinutes
}

// Get the latest cached articles (for users)
export async function getSummary() {
  try {
    const cached = await NewsCache.findOne().sort({ createdAt: -1 })

    if (cached) {
      const cacheAge = Date.now() - new Date(cached.createdAt).getTime()
      const minutes = Math.floor(cacheAge / 60000)
      logger.info(`📦 Using cached articles (${minutes} min old)`)
      return cached.articles // Return array directly
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

    // STEP 1: Scrape fresh content from all portals
    const scrapedData = await scrapeAllPortals()

    // Collect all articles (title + URL only)
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

    // STEP 2: Format articles for AI selection (title + URL only)
    const articleList = allArticles
      .map((article) => `[${article.portal}] ${article.title}\n${article.url}`)
      .join('\n\n')

    // STEP 3: AI selects and categorizes important articles
    const selectionRaw = await selectArticles(articleList)

    // Parse selection
    let selections
    try {
      selections = extractSelections(selectionRaw)
      logger.info('✅ Article selection parsed successfully')
    } catch (parseError) {
      logger.error('❌ Error parsing selection JSON:', parseError)
      logger.error('Raw selection:', selectionRaw.substring(0, 500))
      throw new Error('Selection is not valid JSON')
    }

    if (selections.length === 0) {
      throw new Error('No articles selected by AI')
    }

    // STEP 4: Scrape full content of selected articles
    logger.info('📥 Fetching full content for selected articles...')
    const scrapePromises = selections.map(({ url }) => scrapeArticle(url))
    const scrapedArticles = await Promise.all(scrapePromises)

    // STEP 5: Process each article with AI (generate title, description, explained) IN PARALLEL
    logger.info(
      `🤖 Processing ${scrapedArticles.length} articles in parallel...`
    )
    const processPromises = scrapedArticles.map(async (article, index) => {
      try {
        if (article.error || !article.content) {
          logger.warn(
            `⚠️ Skipping article due to scraping error: ${selections[index].url}`
          )
          return null
        }

        const portalName = new URL(article.url).hostname.replace('www.', '')
        const category = selections[index].category

        // Process article with AI (title + description + explained)
        logger.info(`🤖 Processing: ${article.title.substring(0, 50)}...`)
        const processed = await processArticle(article.title, article.content)

        return {
          category,
          title: processed.title,
          description: processed.description,
          url: article.url,
          content: article.content,
          portal: portalName,
          explained: processed.explained,
        }
      } catch (error) {
        logger.error(
          `❌ Error processing article ${selections[index].url}:`,
          error.message
        )
        return null
      }
    })

    const results = await Promise.all(processPromises)
    const fullArticles = results.filter((article) => article !== null)

    logger.info(
      `✅ Processed ${fullArticles.length}/${selections.length} articles`
    )

    // Verify that we have at least some articles
    if (fullArticles.length === 0) {
      throw new Error('No articles were successfully processed')
    }

    // STEP 6: Save to cache (articles array only)
    await NewsCache.create({
      summary: '', // Deprecated, kept for schema
      articles: fullArticles,
      rawContent: '', // Deprecated
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
    return fullArticles // Return array directly
  } catch (error) {
    logger.error('Error refreshing summary:', error.message || error)
    logger.error('Error stack:', error.stack)

    // Return last cache as fallback
    const lastCache = await NewsCache.findOne().sort({ createdAt: -1 })

    if (lastCache && lastCache.articles && lastCache.articles.length > 0) {
      logger.info('⚠️ Returning last cached articles due to error')
      return lastCache.articles
    }

    throw new Error(
      'No se pudo refrescar el resumen de noticias: ' + (error.message || error)
    )
  }
}
