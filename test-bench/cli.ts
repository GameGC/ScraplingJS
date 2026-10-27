import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { TARGET_ELEMENTS } from './lib/targets'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const FRAMEWORKS = [
  { id: 'nextjs', name: 'Next.js 15 (CSS Modules)', file: '2-indeed-nextjs-cssmodules.html' },
  { id: 'vue', name: 'Vue 3 (Tailwind CSS)', file: '3-indeed-vue-tailwind.html' },
  { id: 'svelte', name: 'Svelte 5 (Scoped CSS)', file: '4-indeed-svelte-scoped.html' },
  { id: 'nodejs', name: 'Node.js (SSR + BEM)', file: '5-indeed-nodejs-bem.html' },
]

async function runCliBenchmark() {
  console.log('\n========================================================================================')
  console.log('⚡  SCRAPLINGJS ADAPTIVE ELEMENT RELOCATION TEST BENCH  ⚡')
  console.log('    Testing element resilience across Framework Migrations & Compiler Hash Churn')
  console.log('========================================================================================\n')

  const baseHtmlPath = path.join(__dirname, 'pages/1-indeed-react-emotion.html')
  const baseHtml = fs.readFileSync(baseHtmlPath, 'utf8')
  const bundlePath = path.resolve(__dirname, '../dist/index.mjs')
  const scraplingBundle = fs.readFileSync(bundlePath, 'utf8')

  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const page = await browser.newPage()

  await page.setContent(`
    <!DOCTYPE html>
    <html>
      <head>
        <script type="module">
          ${scraplingBundle}
          window.Scrapling = { Selector, MemoryStorageSystem, StorageTools, calculateSimilarityScore };
          window.__scraplingReady = true;
        </script>
      </head>
      <body></body>
    </html>
  `)
  await page.waitForFunction(() => (window as any).__scraplingReady === true)

  const overallResults: any[] = []

  for (const fw of FRAMEWORKS) {
    const mutatedHtml = fs.readFileSync(path.join(__dirname, 'pages', fw.file), 'utf8')

    const res = await page.evaluate(
      ({ baseHtml, mutatedHtml, targets, fwName }) => {
        const { Selector, MemoryStorageSystem, StorageTools, calculateSimilarityScore } = (window as any).Scrapling
        const storage = new MemoryStorageSystem({ url: `https://indeed.com/${fwName}` })

        // 1. Train on baseline
        const basePage = new Selector(baseHtml, {
          url: `https://indeed.com/${fwName}`,
          adaptive: true,
          storage,
        })

        const fps = new Map<string, any>()
        for (const t of targets) {
          const found = basePage.css(t.initialSelector, { adaptive: false })
          if (found.length > 0 && found[0].rawNode) {
            basePage.save(found[0], t.id)
            fps.set(t.id, StorageTools.elementToDict(found[0].rawNode))
          }
        }

        // 2. Query mutated
        const mutatedPage = new Selector(mutatedHtml, {
          url: `https://indeed.com/${fwName}`,
          adaptive: true,
          storage,
        })

        const rows = []
        for (const t of targets) {
          const tStart = performance.now()
          const trad = mutatedPage.css(t.initialSelector, { adaptive: false })
          const adapt = mutatedPage.css(t.initialSelector, {
            identifier: t.id,
            adaptive: true,
            percentage: 30,
          })
          const duration = Math.round((performance.now() - tStart) * 10) / 10

          const foundAdapt = adapt.length > 0
          let score = 0
          let relocatedText = ''
          if (foundAdapt && fps.get(t.id)) {
            score = calculateSimilarityScore(fps.get(t.id), adapt[0].rawNode)
            relocatedText = (adapt[0].rawNode.textContent || adapt[0].rawNode.getAttribute('placeholder') || '').trim()
          }

          rows.push({
            id: t.id,
            name: t.name,
            selector: t.initialSelector,
            tradFound: trad.length > 0,
            adaptFound: foundAdapt && score >= 35,
            score,
            duration,
            text: relocatedText.slice(0, 35),
          })
        }

        return rows
      },
      { baseHtml, mutatedHtml, targets: TARGET_ELEMENTS, fwName: fw.id },
    )

    overallResults.push({ fw, rows: res })
  }

  await browser.close()

  // Print results
  for (const { fw, rows } of overallResults) {
    console.log(`\n📌 Target Framework: \x1b[1m\x1b[36m${fw.name}\x1b[0m`)
    console.log('----------------------------------------------------------------------------------------------------------------')
    console.log(
      'Target Element                   | Trad CSS | ScraplingJS | Score  | Time   | Relocated Element Preview',
    )
    console.log('----------------------------------------------------------------------------------------------------------------')

    for (const r of rows) {
      const tradStr = r.tradFound ? '\x1b[32mFOUND\x1b[0m ' : '\x1b[31mFAIL \x1b[0m '
      const adaptStr = r.adaptFound ? '\x1b[32mRECOVERED\x1b[0m' : '\x1b[31mFAIL     \x1b[0m'
      const scoreStr = r.adaptFound ? `\x1b[32m${r.score.toFixed(1)}%\x1b[0m` : '\x1b[31m0.0%\x1b[0m'
      const timeStr = `${r.duration}ms`.padEnd(6)

      console.log(
        `${r.name.padEnd(32)} | ${tradStr} | ${adaptStr} | ${scoreStr.padEnd(6)} | ${timeStr} | "${r.text}"`,
      )
    }
    console.log('----------------------------------------------------------------------------------------------------------------')
  }

  // Summary Metrics
  const totalQueries = overallResults.length * TARGET_ELEMENTS.length
  let totalTradPassed = 0
  let totalAdaptPassed = 0
  let scoreSum = 0

  for (const { rows } of overallResults) {
    for (const r of rows) {
      if (r.tradFound) totalTradPassed++
      if (r.adaptFound) {
        totalAdaptPassed++
        scoreSum += r.score
      }
    }
  }

  const tradRate = ((totalTradPassed / totalQueries) * 100).toFixed(1)
  const adaptRate = ((totalAdaptPassed / totalQueries) * 100).toFixed(1)
  const avgScore = (scoreSum / totalAdaptPassed).toFixed(1)

  console.log('\n========================================================================================')
  console.log('📊 BENCHMARK SUMMARY & RELOCATION RESILIENCE:')
  console.log(`   • Total Scenarios Evaluated:       ${totalQueries}`)
  console.log(`   • Traditional CSS Selector Rate:   \x1b[31m${tradRate}% (${totalTradPassed}/${totalQueries} passed)\x1b[0m`)
  console.log(`   • ScraplingJS Adaptive Rate:       \x1b[32m${adaptRate}% (${totalAdaptPassed}/${totalQueries} passed)\x1b[0m`)
  console.log(`   • Average Similarity Confidence:   \x1b[36m${avgScore}%\x1b[0m`)
  console.log('========================================================================================\n')
}

runCliBenchmark().catch((err) => {
  console.error('Benchmark failed:', err)
  process.exit(1)
})
