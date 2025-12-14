import puppeteer from 'puppeteer'
import { logger } from '../utils/logger.js'

export async function scrapePortal(url) {
  let browser

  try {
    logger.info(`🔍 Scraping: ${url}`)

    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    })

    const page = await browser.newPage()

    // Set user agent to avoid detection
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    )

    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    })

    // Extract all text from body
    const textContent = await page.evaluate(() => {
      // Remove script, style, and other non-content tags
      const elementsToRemove = document.querySelectorAll(
        'script, style, nav, footer, header, iframe, noscript'
      )
      elementsToRemove.forEach((el) => el.remove())

      return document.body.innerText
    })

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
  } finally {
    if (browser) {
      await browser.close()
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
