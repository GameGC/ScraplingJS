import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { chromium, type Browser, type Page } from 'playwright'
import { generateMutatedPage } from '../pages/generator'
import { resolveDynamicParams } from '../lib/request-params'
import { resolvePageFile } from '../lib/page-file'
import { TARGET_ELEMENTS } from '../lib/targets'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const BENCH_DIR = path.resolve(__dirname, '..')

function escapeModuleSource(source: string): string {
  return source.replace(/<\/script/gi, '<\\/script')
}

export interface ServerInstance {
  port: number
  url: string
  close: () => Promise<void>
}

const FRAMEWORKS = [
  {
    id: 'react-emotion',
    name: 'React 19 + Emotion (IFL7)',
    pageFile: '1-indeed-react-emotion.html',
    compilerMode: 'Emotion hashed classes (css-1g12v77)',
    description: 'Baseline Indeed markup featuring React 19 and Emotion CSS-in-JS hashes.',
  },
  {
    id: 'nextjs-cssmodules',
    name: 'Next.js 15 (RSC) + CSS Modules',
    pageFile: '2-indeed-nextjs-cssmodules.html',
    compilerMode: 'Scoped CSS Modules (_SearchBox_searchContainer__a7f1e)',
    description: 'Framework migrated to Next.js RSC with CSS modules hashing and form tags.',
  },
  {
    id: 'vue-tailwind',
    name: 'Vue 3 / Nuxt 3 + Tailwind CSS',
    pageFile: '3-indeed-vue-tailwind.html',
    compilerMode: 'Tailwind utilities + Vue SFC scope (data-v-7b9f12a3)',
    description: 'Complete UI redesign with Tailwind utility classes and Vue template scopes.',
  },
  {
    id: 'svelte-scoped',
    name: 'Svelte 5 / SvelteKit',
    pageFile: '4-indeed-svelte-scoped.html',
    compilerMode: 'Component scoped CSS (svelte-1a8f9x2)',
    description: 'Migrated to Svelte 5 components with scoped styles and semantic layout.',
  },
  {
    id: 'nodejs-bem',
    name: 'Node.js Express SSR + BEM',
    pageFile: '5-indeed-nodejs-bem.html',
    compilerMode: 'Server-side rendered BEM classes (indeed-search__control)',
    description: 'Classic server-rendered HTML template with strict BEM naming architecture.',
  },
]

export async function createBenchServer(port = 4000): Promise<ServerInstance> {
  const app = new Hono()

  const browser: Browser = await chromium.launch({ channel: 'chrome', headless: true })
  const workerPage: Page = await browser.newPage()

  const scraplingBundle = escapeModuleSource(
    fs.readFileSync(path.resolve(BENCH_DIR, '../dist/index.mjs'), 'utf8'),
  )
  await workerPage.setContent(`
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
  await workerPage.waitForFunction(() => (window as any).__scraplingReady === true)

  // The bench reuses a single page; serialize evaluations so concurrent HTTP
  // requests cannot interleave their documents and storage state.
  let workerQueue: Promise<unknown> = Promise.resolve()
  const evaluateOnWorker = <T>(pageFunction: (arg: any) => T, arg: any): Promise<T> => {
    const run = workerQueue.then(() => workerPage.evaluate(pageFunction, arg))
    workerQueue = run.then(
      () => undefined,
      () => undefined,
    )
    return run as Promise<T>
  }

  app.get('/', (c) => {
    const html = fs.readFileSync(path.join(BENCH_DIR, 'public/index.html'), 'utf8')
    return c.html(html)
  })

  app.get('/dashboard.css', (c) => {
    const css = fs.readFileSync(path.join(BENCH_DIR, 'public/dashboard.css'), 'utf8')
    c.header('Content-Type', 'text/css')
    return c.body(css)
  })

  app.get('/dashboard.js', (c) => {
    const js = fs.readFileSync(path.join(BENCH_DIR, 'public/dashboard.js'), 'utf8')
    c.header('Content-Type', 'application/javascript')
    return c.body(js)
  })

  app.get('/pages/:filename', (c) => {
    const filename = c.req.param('filename')
    const filePath = resolvePageFile(BENCH_DIR, filename)
    if (filePath && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const html = fs.readFileSync(filePath, 'utf8')
      return c.html(html)
    }
    return c.text('Page not found', 404)
  })

  app.get('/dynamic', (c) => {
    const params = resolveDynamicParams({
      seed: c.req.query('seed'),
      framework: c.req.query('framework'),
    })
    if (!params.ok) {
      return c.text(params.error, 400)
    }
    const html = generateMutatedPage({
      hashSeed: params.seed,
      framework: params.framework,
    })
    return c.html(html)
  })

  app.get('/api/frameworks', (c) => c.json(FRAMEWORKS))
  app.get('/api/targets', (c) => c.json(TARGET_ELEMENTS))

  app.post('/api/locate', async (c) => {
    const { frameworkId, targetId } = await c.req.json()
    const target = TARGET_ELEMENTS.find((t) => t.id === targetId) || TARGET_ELEMENTS[0]
    const fw = FRAMEWORKS.find((f) => f.id === frameworkId) || FRAMEWORKS[1]

    const baseHtml = fs.readFileSync(path.join(BENCH_DIR, 'pages/1-indeed-react-emotion.html'), 'utf8')
    const mutatedHtml = fs.readFileSync(path.join(BENCH_DIR, 'pages', fw.pageFile), 'utf8')

    const result = await evaluateOnWorker(
      ({ baseHtml, mutatedHtml, target }: { baseHtml: string; mutatedHtml: string; target: any }) => {
        const { Selector, MemoryStorageSystem, StorageTools, calculateSimilarityScore } = (window as any).Scrapling
        const storage = new MemoryStorageSystem({ url: 'https://indeed.com/bench' })

        const basePage = new Selector(baseHtml, {
          url: 'https://indeed.com/bench',
          storage,
        })
        const foundBase = basePage.rawNode?.querySelectorAll(target.initialSelector) ?? []
        let baseFp: any = null
        if (foundBase.length > 0) {
          basePage.save(foundBase[0], target.id)
          baseFp = StorageTools.elementToDict(foundBase[0])
        }

        const startTime = performance.now()
        const mutatedPage = new Selector(mutatedHtml, {
          url: 'https://indeed.com/bench',
          storage,
        })

        const tradResult = mutatedPage.rawNode?.querySelectorAll(target.initialSelector) ?? []
        const traditionalFound = tradResult.length > 0

        const adaptResult = mutatedPage.css(target.initialSelector, {
          identifier: target.id,
          percentage: 30,
        })
        const durationMs = Math.round((performance.now() - startTime) * 100) / 100

        const adaptiveFound = adaptResult.length > 0
        let confidenceScore = 0
        let relocatedTag = ''
        let relocatedText = ''

        let tagChanged = false
        let classChanged = false
        let textMatched = false
        let depthDelta = 0

        if (adaptiveFound) {
          const rawEl = adaptResult[0].rawNode
          if (rawEl && baseFp) {
            confidenceScore = calculateSimilarityScore(baseFp, rawEl)
            relocatedTag = rawEl.tagName.toLowerCase()
            relocatedText = (rawEl.textContent || rawEl.getAttribute('placeholder') || '').trim()

            tagChanged = baseFp.tag !== relocatedTag
            classChanged = (baseFp.attributes?.class || '') !== (rawEl.className || '')
            depthDelta = Math.abs((baseFp.depth || 0) - StorageTools.getElementPath(rawEl).length)

            if (target.expectedTextSnippet) {
              textMatched = relocatedText.toLowerCase().includes(target.expectedTextSnippet.toLowerCase())
            } else if (target.expectedAttr) {
              const val = rawEl.getAttribute(target.expectedAttr.name) || ''
              textMatched = val.toLowerCase().includes(target.expectedAttr.valueSnippet.toLowerCase())
            } else {
              textMatched = true
            }
          }
        }

        return {
          targetId: target.id,
          targetName: target.name,
          initialSelector: target.initialSelector,
          traditionalFound,
          traditionalCount: tradResult.length,
          adaptiveFound,
          confidenceScore,
          relocatedTag,
          relocatedText: relocatedText.slice(0, 80),
          durationMs,
          fingerprintDiff: {
            tagChanged,
            classChanged,
            textMatched,
            depthDelta,
          },
        }
      },
      { baseHtml, mutatedHtml, target },
    )

    return c.json(result)
  })

  app.get('/api/benchmark', async (c) => {
    const baseHtml = fs.readFileSync(path.join(BENCH_DIR, 'pages/1-indeed-react-emotion.html'), 'utf8')

    const matrix = []
    for (const fw of FRAMEWORKS) {
      const mutatedHtml = fs.readFileSync(path.join(BENCH_DIR, 'pages', fw.pageFile), 'utf8')

      const fwResult = await evaluateOnWorker(
        ({ baseHtml, mutatedHtml, fw, targets }: { baseHtml: string; mutatedHtml: string; fw: any; targets: any[] }) => {
          const { Selector, MemoryStorageSystem, StorageTools, calculateSimilarityScore } = (window as any).Scrapling
          const storage = new MemoryStorageSystem({ url: `https://indeed.com/${fw.id}` })

          const basePage = new Selector(baseHtml, {
            url: `https://indeed.com/${fw.id}`,
            storage,
          })

          const fingerprints = new Map<string, any>()
          for (const target of targets) {
            const found = basePage.rawNode?.querySelectorAll(target.initialSelector) ?? []
            if (found.length > 0) {
              basePage.save(found[0], target.id)
              fingerprints.set(target.id, StorageTools.elementToDict(found[0]))
            }
          }

          const mutatedPage = new Selector(mutatedHtml, {
            url: `https://indeed.com/${fw.id}`,
            storage,
          })

          const results = []
          for (const target of targets) {
            const tradResult = mutatedPage.rawNode?.querySelectorAll(target.initialSelector) ?? []
            const queryStart = performance.now()
            const adaptResult = mutatedPage.css(target.initialSelector, {
              identifier: target.id,
              percentage: 30,
            })
            const durationMs = Math.round((performance.now() - queryStart) * 100) / 100

            const adaptiveFound = adaptResult.length > 0
            let confidenceScore = 0
            let relocatedTag = ''
            let relocatedText = ''
            let matchedExpected = false

            const baseFp = fingerprints.get(target.id)
            if (adaptiveFound && baseFp) {
              const rawEl = adaptResult[0].rawNode
              confidenceScore = calculateSimilarityScore(baseFp, rawEl)
              relocatedTag = rawEl.tagName.toLowerCase()
              relocatedText = (rawEl.textContent || rawEl.getAttribute('placeholder') || '').trim()
              if (target.expectedTextSnippet) {
                matchedExpected = relocatedText
                  .toLowerCase()
                  .includes(target.expectedTextSnippet.toLowerCase())
              } else if (target.expectedAttr) {
                const val = rawEl.getAttribute(target.expectedAttr.name) || ''
                matchedExpected = val
                  .toLowerCase()
                  .includes(target.expectedAttr.valueSnippet.toLowerCase())
              } else {
                matchedExpected = true
              }
            }

            results.push({
              targetId: target.id,
              targetName: target.name,
              initialSelector: target.initialSelector,
              traditionalFound: tradResult.length > 0,
              adaptiveFound: adaptiveFound && matchedExpected,
              matchedExpected,
              confidenceScore,
              relocatedTag,
              relocatedText: relocatedText.slice(0, 60),
              durationMs,
            })
          }

          return {
            frameworkId: fw.id,
            frameworkName: fw.name,
            compilerMode: fw.compilerMode,
            results,
          }
        },
        { baseHtml, mutatedHtml, fw, targets: TARGET_ELEMENTS },
      )

      matrix.push(fwResult)
    }

    return c.json(matrix)
  })

  const server = serve({
    fetch: app.fetch,
    port,
  })

  return {
    port,
    url: `http://localhost:${port}`,
    close: async () => {
      await browser.close()
      return new Promise<void>((resolve, reject) => {
        server.close((err?: Error) => (err ? reject(err) : resolve()))
      })
    },
  }
}
