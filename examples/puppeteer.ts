/**
 * ScraplingJS × Puppeteer.
 *
 *   pnpm build
 *   pnpm demo:puppeteer
 *
 * Uses the regular `puppeteer` package and its Puppeteer-managed Chrome. No
 * `puppeteer-core`, executable discovery or offline fallback.
 */
import puppeteer from 'puppeteer'
import { setDomAdapter } from 'scrapling-js'
import { createNodeDomAdapter } from 'scrapling-js/node'
import {
  redesignSite,
  runShopStory,
  SHOP_V1,
  type DemoPage,
} from './shop-demo'

async function main(): Promise<void> {
  setDomAdapter(createNodeDomAdapter())

  const browser = await puppeteer.launch({ headless: true })
  try {
    const page = await browser.newPage()
    await page.setContent(SHOP_V1)
    const demoPage: DemoPage = {
      content: () => page.content(),
      $: (selector) => page.$(selector),
      redesign: async () => {
        await page.evaluate(redesignSite)
      },
    }
    await runShopStory(demoPage)
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error('Demo failed:', error)
  process.exitCode = 1
})
