import * as cheerio from 'cheerio'
import { logger } from '../utils/logger.js'

// Extrae la URL base de un portal
function getBaseUrl(url) {
  try {
    const urlObj = new URL(url)
    return `${urlObj.protocol}//${urlObj.host}`
  } catch {
    return url
  }
}

// Normaliza una URL relativa a absoluta
function normalizeUrl(link, baseUrl) {
  if (!link) return null
  if (link.startsWith('http')) return link
  if (link.startsWith('//')) return `https:${link}`
  if (link.startsWith('/')) return `${baseUrl}${link}`
  return `${baseUrl}/${link}`
}

// Scrapear artículo individual (contenido completo)
export async function scrapeArticle(url) {
  try {
    logger.info(`📄 Scraping article: ${url}`)

    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(30000),
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const html = await response.text()
    const $ = cheerio.load(html)

    // Remove junk
    $('script, style, nav, footer, header, iframe, aside, .ad, .ads').remove()

    // Extract title
    let title =
      $('h1').first().text().trim() ||
      $('title').text().trim() ||
      $('meta[property="og:title"]').attr('content') ||
      ''

    // Limpiar el título removiendo el nombre del portal (ej: "Título - Infobae")
    title = title.replace(/\s*[-|–—]\s*[^-|–—]+$/i, '').trim()

    // Extract main content (varios selectores comunes)
    let content = ''
    const contentSelectors = [
      'article',
      '.article-content',
      '.story-content',
      '.post-content',
      'main',
      '.entry-content',
      '[itemprop="articleBody"]',
    ]

    for (const selector of contentSelectors) {
      const $content = $(selector)
      if ($content.length) {
        // Extraer todos los párrafos
        content = $content
          .find('p')
          .map((_, el) => $(el).text().trim())
          .get()
          .filter((p) => p.length > 30) // Filtrar párrafos muy cortos
          .join('\n\n')

        if (content.length > 200) break // Si encontró buen contenido, parar
      }
    }

    // Fallback: tomar todo el body
    if (content.length < 200) {
      content = $('body').text().replace(/\s+/g, ' ').trim()
    }

    logger.info(
      `✅ Article scraped: ${title.substring(0, 50)}... (${
        content.length
      } chars)`
    )

    return {
      url,
      title,
      content,
      scrapedAt: new Date().toISOString(),
    }
  } catch (error) {
    logger.error(`❌ Error scraping article ${url}:`, error.message)
    return {
      url,
      title: '',
      content: '',
      error: error.message,
      scrapedAt: new Date().toISOString(),
    }
  }
}

export async function scrapePortal(url) {
  try {
    logger.info(`🔍 Scraping: ${url}`)

    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(45000), // Aumentar timeout a 45 seg
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const html = await response.text()
    logger.info(`📄 Downloaded ${html.length} bytes from ${url}`)

    const $ = cheerio.load(html)
    const baseUrl = getBaseUrl(url)
    const portalName = new URL(url).hostname.replace('www.', '')

    // Remove non-content elements
    $(
      'script, style, nav, footer, header, iframe, noscript, aside, .ad, .ads, .advertisement'
    ).remove()

    const articles = []
    const seenUrls = new Set()

    // Selectores comunes para artículos de noticias (mejorados para Infobae y otros)
    const articleSelectors = [
      'article a[href*="/"]',
      '.story-card a',
      '.card-content a',
      'h2 a[href]',
      'h3 a[href]',
      '.headline a',
      '.title a',
      'a[href*="noticia"]',
      'a[href*="articulo"]',
    ]

    // Buscar todos los links que parezcan noticias
    $('a[href]').each((_, element) => {
      const $link = $(element)
      const href = $link.attr('href')
      const articleUrl = normalizeUrl(href, baseUrl)

      if (!articleUrl || seenUrls.has(articleUrl)) return

      // Filtrar links que no parecen artículos
      if (
        !articleUrl.includes(portalName) ||
        articleUrl.includes('#') ||
        articleUrl.match(/\/(tag|category|autor|author|seccion|section)\//i)
      ) {
        return
      }

      // Buscar el título (el texto del link o un heading cercano)
      let title = $link.text().trim()

      // Si el link no tiene texto, buscar en elementos cercanos
      if (!title || title.length < 15) {
        const $parent = $link.closest('article, .article, .story, .card, .news')
        title = $parent
          .find('h1, h2, h3, h4, .title, .headline')
          .first()
          .text()
          .trim()
      }

      // Buscar descripción/contenido
      let content = ''
      const $parent = $link.closest('article, .article, .story, .card, .news')
      if ($parent.length) {
        content = $parent
          .find('p, .summary, .description, .excerpt, .deck')
          .first()
          .text()
          .trim()
      }

      // Solo agregar si tiene un título decente
      // No duplicar título en content - dejar vacío si no hay descripción
      if (title && title.length >= 15 && title.length <= 300) {
        articles.push({
          title,
          url: articleUrl,
          content: content && content !== title ? content : '',
          portal: portalName,
        })
        seenUrls.add(articleUrl)
      }
    })

    logger.info(`🔗 Found ${articles.length} potential articles from ${url}`)

    // Si no encontró artículos estructurados, fallback al método anterior
    if (articles.length === 0) {
      logger.warn(
        `⚠️ No articles found with selectors, using text fallback for ${url}`
      )

      const textContent = $('body').text().replace(/\s+/g, ' ').trim()

      return {
        url,
        articles: [
          {
            title: `Contenido completo de ${portalName}`,
            url,
            content: textContent.substring(0, 8000), // Aumentar límite
            portal: portalName,
          },
        ],
        scrapedAt: new Date().toISOString(),
      }
    }

    logger.info(`✅ Scraped ${articles.length} articles from ${url}`)

    return {
      url,
      articles,
      scrapedAt: new Date().toISOString(),
    }
  } catch (error) {
    logger.error(`❌ Error scraping ${url}:`, error.message)
    return {
      url,
      articles: [],
      error: error.message,
      scrapedAt: new Date().toISOString(),
    }
  }
}

export async function scrapeAllPortals() {
  const portals = process.env.NEWS_PORTALS?.split(',') || []

  if (portals.length === 0) {
    throw new Error('No news portals configured in .env')
  }

  logger.info(`📡 Starting to scrape ${portals.length} portals...`)

  const results = await Promise.all(
    portals.map((url) => scrapePortal(url.trim()))
  )

  const successfulScrapes = results.filter((r) => !r.error)
  const totalArticles = results.reduce(
    (sum, r) => sum + (r.articles?.length || 0),
    0
  )

  logger.info(
    `✅ Successfully scraped ${successfulScrapes.length}/${portals.length} portals (${totalArticles} articles)`
  )

  return results
}
