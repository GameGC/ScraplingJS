/**
 * ScraplingJS × Playwright.
 *
 *   pnpm build
 *   pnpm demo:playwright
 *
 * Without a local Chromium the script falls back to the offline Node adapter.
 * Set PLAYWRIGHT_CHANNEL=chrome to use an installed Chrome.
 */
import { setDomAdapter } from 'scrapling-js'
import { createNodeDomAdapter } from 'scrapling-js/node'
import {
  createOfflinePage,
  redesignSite,
  runShopStory,
  SHOP_V1,
  type DemoPage,
} from './shop-demo'

interface PlaywrightPage {
  setContent(html: string): Promise<void>
  content(): Promise<string>
  $(selector: string): Promise<unknown>
  evaluate<R>(pageFunction: () => R): Promise<R>
}

interface PlaywrightBrowser {
  newPage(): Promise<PlaywrightPage>
  close(): Promise<void>
}

function env(name: string): string | undefined {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
  return proc?.env?.[name]
}

async function launchPlaywright(): Promise<PlaywrightBrowser | null> {
  try {
    const { chromium } = await import('playwright')
    const channel = env('PLAYWRIGHT_CHANNEL')
    return await chromium.launch({ headless: true, ...(channel ? { channel } : {}) })
  } catch (error) {
    console.log(`Playwright is unavailable (${(error as Error).message}).`)
    console.log('Install it with: pnpm add -D playwright && pnpm exec playwright install chromium\n')
    return null
  }
}

async function main(): Promise<void> {
  const adapter = createNodeDomAdapter()
  setDomAdapter(adapter)

  const browser = await launchPlaywright()
  if (!browser) {
    await runShopStory(createOfflinePage(adapter))
    return
  }

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
