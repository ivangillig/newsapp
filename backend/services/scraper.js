import * as cheerio from 'cheerio'
import { logger } from '../utils/logger.js'

export async function scrapePortal(url) {
  try {
    logger.info(`🔍 Scraping: ${url}`)

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(30000),
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const html = await response.text()
    const $ = cheerio.load(html)

    // Remove non-content elements
    $('script, style, nav, footer, header, iframe, noscript, aside, .ad, .ads, .advertisement').remove()

    // Extract text from main content areas
    const textContent = $('article, main, .content, .article, .post, body')
      .first()
      .text()
      .replace(/\s+/g, ' ')
      .trim()

    logger.info(`✅ Scraped ${textContent.length} characters from ${url}`)

    return {
      url,
      content: textContent,
      scrapedAt: new Date().toISOString(),
    }
  } catch (error) {
    logger.error(`❌ Error scraping ${url}:`, error.message)
    return {
      url,
      content: '',
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

  logger.info(
    `✅ Successfully scraped ${successfulScrapes.length}/${portals.length} portals`
  )

  return results
}
