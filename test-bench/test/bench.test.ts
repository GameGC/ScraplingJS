import { beforeEach, describe, expect, it } from 'vitest'
import {
  calculateSimilarityScore,
  MemoryStorageSystem,
  Selector,
  StorageTools,
} from '../../src'
import { TARGET_ELEMENTS } from '../lib/targets'
import { generateMutatedPage } from '../pages/generator'

describe('ScraplingJS Layout Mutation Test Bench', () => {
  let baseHtml: string
  let nextHtml: string
  let vueHtml: string
  let svelteHtml: string
  let nodeHtml: string

  beforeEach(async () => {
    MemoryStorageSystem.clearAll()
    if (!baseHtml) {
      const [r1, r2, r3, r4, r5] = await Promise.all([
        fetch('/test-bench/pages/1-indeed-react-emotion.html').then((r) => r.text()),
        fetch('/test-bench/pages/2-indeed-nextjs-cssmodules.html').then((r) => r.text()),
        fetch('/test-bench/pages/3-indeed-vue-tailwind.html').then((r) => r.text()),
        fetch('/test-bench/pages/4-indeed-svelte-scoped.html').then((r) => r.text()),
        fetch('/test-bench/pages/5-indeed-nodejs-bem.html').then((r) => r.text()),
      ])
      baseHtml = r1
      nextHtml = r2
      vueHtml = r3
      svelteHtml = r4
      nodeHtml = r5
    }
  })

  it('verifies baseline page elements are correctly discoverable', () => {
    const page = new Selector(baseHtml, { url: 'https://indeed.com/jobs', adaptive: true })
    for (const target of TARGET_ELEMENTS) {
      const found = page.css(target.initialSelector, { adaptive: false })
      expect(found.length).toBeGreaterThan(0)
    }
  })

  it('proves traditional CSS selectors break (0% success) when framework/CSS hashes change', () => {
    const nextClean = new Selector(nextHtml, { url: 'https://indeed.com/jobs', adaptive: false })
    const vueClean = new Selector(vueHtml, { url: 'https://indeed.com/jobs', adaptive: false })
    const svelteClean = new Selector(svelteHtml, { url: 'https://indeed.com/jobs', adaptive: false })
    const nodeClean = new Selector(nodeHtml, { url: 'https://indeed.com/jobs', adaptive: false })

    for (const target of TARGET_ELEMENTS) {
      expect(nextClean.css(target.initialSelector, { adaptive: false }).length).toBe(0)
      expect(vueClean.css(target.initialSelector, { adaptive: false }).length).toBe(0)
      expect(svelteClean.css(target.initialSelector, { adaptive: false }).length).toBe(0)
      expect(nodeClean.css(target.initialSelector, { adaptive: false }).length).toBe(0)
    }
  })

  it('adaptively relocates all target elements on Next.js 15 (CSS Modules)', () => {
    const storage = new MemoryStorageSystem({ url: 'https://indeed.com/jobs' })
    const basePage = new Selector(baseHtml, { url: 'https://indeed.com/jobs', adaptive: true, storage })

    for (const target of TARGET_ELEMENTS) {
      const el = basePage.css(target.initialSelector, { adaptive: false })[0]
      basePage.save(el, target.id)
    }

    const nextMigrated = new Selector(nextHtml, { url: 'https://indeed.com/jobs', adaptive: true, storage })

    for (const target of TARGET_ELEMENTS) {
      const recovered = nextMigrated.css(target.initialSelector, {
        identifier: target.id,
        adaptive: true,
        percentage: 35,
      })
      expect(recovered.length).toBeGreaterThan(0)
      const raw = recovered[0].rawNode!
      const text = (raw.textContent || raw.getAttribute('placeholder') || '').trim()

      if (target.expectedTextSnippet) {
        expect(text.toLowerCase()).toContain(target.expectedTextSnippet.toLowerCase())
      }
    }
  })

  it('adaptively relocates all target elements on Vue 3 + Tailwind CSS', () => {
    const storage = new MemoryStorageSystem({ url: 'https://indeed.com/jobs' })
    const basePage = new Selector(baseHtml, { url: 'https://indeed.com/jobs', adaptive: true, storage })

    for (const target of TARGET_ELEMENTS) {
      const el = basePage.css(target.initialSelector, { adaptive: false })[0]
      basePage.save(el, target.id)
    }

    const vueMigrated = new Selector(vueHtml, { url: 'https://indeed.com/jobs', adaptive: true, storage })

    for (const target of TARGET_ELEMENTS) {
      const recovered = vueMigrated.css(target.initialSelector, {
        identifier: target.id,
        adaptive: true,
        percentage: 35,
      })
      expect(recovered.length).toBeGreaterThan(0)
    }
  })

  it('adaptively relocates all target elements on Svelte 5 (Scoped CSS)', () => {
    const storage = new MemoryStorageSystem({ url: 'https://indeed.com/jobs' })
    const basePage = new Selector(baseHtml, { url: 'https://indeed.com/jobs', adaptive: true, storage })

    for (const target of TARGET_ELEMENTS) {
      const el = basePage.css(target.initialSelector, { adaptive: false })[0]
      basePage.save(el, target.id)
    }

    const svelteMigrated = new Selector(svelteHtml, { url: 'https://indeed.com/jobs', adaptive: true, storage })

    for (const target of TARGET_ELEMENTS) {
      const recovered = svelteMigrated.css(target.initialSelector, {
        identifier: target.id,
        adaptive: true,
        percentage: 35,
      })
      expect(recovered.length).toBeGreaterThan(0)
    }
  })

  it('adaptively relocates all target elements on Node.js Express SSR (BEM)', () => {
    const storage = new MemoryStorageSystem({ url: 'https://indeed.com/jobs' })
    const basePage = new Selector(baseHtml, { url: 'https://indeed.com/jobs', adaptive: true, storage })

    for (const target of TARGET_ELEMENTS) {
      const el = basePage.css(target.initialSelector, { adaptive: false })[0]
      basePage.save(el, target.id)
    }

    const nodeMigrated = new Selector(nodeHtml, { url: 'https://indeed.com/jobs', adaptive: true, storage })

    for (const target of TARGET_ELEMENTS) {
      const recovered = nodeMigrated.css(target.initialSelector, {
        identifier: target.id,
        adaptive: true,
        percentage: 35,
      })
      expect(recovered.length).toBeGreaterThan(0)
    }
  })

  it('survives randomized compilation arguments and hash perturbations', () => {
    const storage = new MemoryStorageSystem({ url: 'https://indeed.com/jobs' })
    const basePage = new Selector(baseHtml, { url: 'https://indeed.com/jobs', adaptive: true, storage })

    const whatEl = basePage.css('input.css-1rtikjh')[0]
    basePage.save(whatEl, 'search-input')

    const submitEl = basePage.css('button.css-17qy6hn')[0]
    basePage.save(submitEl, 'submit-btn')

    const randomSeed = 'hash_' + Math.floor(Math.random() * 99999)
    const dynamicHtml = generateMutatedPage({ hashSeed: randomSeed, tagVariation: 'classic' })

    const dynamicPage = new Selector(dynamicHtml, { url: 'https://indeed.com/jobs', adaptive: true, storage })

    expect(dynamicPage.css('input.css-1rtikjh', { adaptive: false }).length).toBe(0)
    expect(dynamicPage.css('button.css-17qy6hn', { adaptive: false }).length).toBe(0)

    const recoveredInput = dynamicPage.css('input.css-1rtikjh', {
      identifier: 'search-input',
      adaptive: true,
      percentage: 35,
    })
    const recoveredSubmit = dynamicPage.css('button.css-17qy6hn', {
      identifier: 'submit-btn',
      adaptive: true,
      percentage: 35,
    })

    expect(recoveredInput.length).toBe(1)
    expect(recoveredSubmit.length).toBe(1)
    expect(recoveredSubmit[0].text.toString().trim()).toBe('Find jobs')
  })
})
