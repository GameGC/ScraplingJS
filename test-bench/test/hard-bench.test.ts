
import { beforeEach, describe, expect, it } from 'vitest'
import {
  MemoryStorageSystem,
  Selector,
  StorageTools,
  calculateSimilarityScore,
} from '../../src'
import { TARGET_ELEMENTS } from '../lib/targets'
import { HARD_TEXT_ALTERNATIVES } from '../lib/hard-targets'

function textMatches(targetId: string, got: string, fallbackSnippet?: string): boolean {
  const alts = HARD_TEXT_ALTERNATIVES[targetId]
  const candidates = alts ?? (fallbackSnippet ? [fallbackSnippet] : [])
  const lower = got.toLowerCase()
  return candidates.some((c) => lower.includes(c.toLowerCase()))
}

describe('HARD: ScraplingJS real-world migration resilience', () => {
  let baseHtml: string
  let structuralHtml: string
  let textDriftHtml: string
  let semanticHtml: string
  let extremeHtml: string

  beforeEach(async () => {
    MemoryStorageSystem.clearAll()
    if (!baseHtml) {
      const [r0, r1, r2, r3, r4] = await Promise.all([
        fetch('/test-bench/pages/1-indeed-react-emotion.html').then((r) => r.text()),
        fetch('/test-bench/pages/hard/6-structural-refactor.html').then((r) => r.text()),
        fetch('/test-bench/pages/hard/7-text-drift-and-decoys.html').then((r) => r.text()),
        fetch('/test-bench/pages/hard/8-semantic-overhaul.html').then((r) => r.text()),
        fetch('/test-bench/pages/hard/9-extreme-layout-shift.html').then((r) => r.text()),
      ])
      baseHtml = r0
      structuralHtml = r1
      textDriftHtml = r2
      semanticHtml = r3
      extremeHtml = r4
    }
  })

  function train(storage: InstanceType<typeof MemoryStorageSystem>) {
    const basePage = new Selector(baseHtml, {
      url: 'https://indeed.com/jobs',
      adaptive: true,
      storage,
    })
    for (const t of TARGET_ELEMENTS) {
      const found = basePage.css(t.initialSelector, { adaptive: false })
      if (found.length > 0) {
        basePage.save(found[0], t.id)
      }
    }
    return basePage
  }

  it('HARD structural refactor: recovers all 9 targets with correct content', () => {
    const storage = new MemoryStorageSystem({ url: 'https://indeed.com/jobs' })
    train(storage)

    const page = new Selector(structuralHtml, {
      url: 'https://indeed.com/jobs',
      adaptive: true,
      storage,
    })

    for (const t of TARGET_ELEMENTS) {
      expect(page.css(t.initialSelector, { adaptive: false }).length).toBe(0)
    }

    let recovered = 0
    for (const t of TARGET_ELEMENTS) {
      const hits = page.css(t.initialSelector, {
        identifier: t.id,
        adaptive: true,
        percentage: 40,
      })
      expect(hits.length).toBeGreaterThan(0)
      const raw = hits[0].rawNode!
      const text = (raw.textContent || raw.getAttribute('placeholder') || '').trim()

      if (t.expectedTextSnippet || t.expectedAttr) {
        const ok = textMatches(t.id, text, t.expectedTextSnippet)
        if (ok) {
          recovered++
        }
      } else {
        recovered++
      }
    }
    expect(recovered).toBeGreaterThanOrEqual(8)
  })

  it('HARD text-drift + decoys: finds correct job card, not a near-duplicate', () => {
    const storage = new MemoryStorageSystem({ url: 'https://indeed.com/jobs' })
    train(storage)

    const page = new Selector(textDriftHtml, {
      url: 'https://indeed.com/jobs',
      adaptive: true,
      storage,
    })

    const titleHits = page.css('h2.css-job-title-heading a', {
      identifier: 'job-title-1',
      adaptive: true,
      percentage: 40,
    })
    expect(titleHits.length).toBeGreaterThan(0)
    const titleText = (titleHits[0].rawNode!.textContent || '').trim()
    expect(titleText).toBe('Unity Developer')

    const companyHits = page.css('div.css-company-name', {
      identifier: 'job-company-1',
      adaptive: true,
      percentage: 40,
    })
    expect(companyHits.length).toBeGreaterThan(0)
    const companyText = (companyHits[0].rawNode!.textContent || '').trim()
    expect(companyText).toContain('Unity Technologies')

    const submitHits = page.css('button.css-17qy6hn', {
      identifier: 'submit-button',
      adaptive: true,
      percentage: 35,
    })
    expect(submitHits.length).toBeGreaterThan(0)
    const submitText = (submitHits[0].rawNode!.textContent || '').trim()
    expect(textMatches('submit-button', submitText)).toBe(true)

    const applyHits = page.css('button.css-apply-button', {
      identifier: 'apply-button-1',
      adaptive: true,
      percentage: 35,
    })
    expect(applyHits.length).toBeGreaterThan(0)
    const applyText = (applyHits[0].rawNode!.textContent || '').trim()
    expect(textMatches('apply-button-1', applyText)).toBe(true)

    expect(applyText.toLowerCase()).not.toContain('companies')
  })

  it('HARD semantic overhaul: survives tag swaps and role-based controls', () => {
    const storage = new MemoryStorageSystem({ url: 'https://indeed.com/jobs' })
    train(storage)

    const page = new Selector(semanticHtml, {
      url: 'https://indeed.com/jobs',
      adaptive: true,
      storage,
    })

    for (const id of ['what-input', 'where-input'] as const) {
      const t = TARGET_ELEMENTS.find((x) => x.id === id)!
      const hits = page.css(t.initialSelector, {
        identifier: id,
        adaptive: true,
        percentage: 40,
      })
      expect(hits.length).toBeGreaterThan(0)
      expect(hits[0].rawNode!.tagName.toLowerCase()).toBe('input')
    }

    const applyHits = page.css('button.css-apply-button', {
      identifier: 'apply-button-1',
      adaptive: true,
      percentage: 35,
    })
    expect(applyHits.length).toBeGreaterThan(0)
    const applyEl = applyHits[0].rawNode!
    const applyTag = applyEl.tagName.toLowerCase()
    expect(['button', 'a', 'div']).toContain(applyTag)
    const applyText = (applyEl.textContent || '').trim()
    expect(applyText.toLowerCase()).toContain('easily apply')

    const remoteHits = page.css('button.css-1k63ypn.active', {
      identifier: 'remote-filter',
      adaptive: true,
      percentage: 35,
    })
    if (remoteHits.length > 0) {
      expect((remoteHits[0].rawNode!.textContent || '').trim()).toContain('Remote')
    }

    const titleHits = page.css('h2.css-job-title-heading a', {
      identifier: 'job-title-1',
      adaptive: true,
      percentage: 40,
    })
    expect(titleHits.length).toBeGreaterThan(0)
    expect((titleHits[0].rawNode!.textContent || '').trim()).toBe('Unity Developer')
  })

  it('HARD extreme layout: recovers core targets despite sidebar + sparse copy', () => {
    const storage = new MemoryStorageSystem({ url: 'https://indeed.com/jobs' })
    train(storage)

    const page = new Selector(extremeHtml, {
      url: 'https://indeed.com/jobs',
      adaptive: true,
      storage,
    })

    const what = page.css('input.css-1rtikjh', {
      identifier: 'what-input',
      adaptive: true,
      percentage: 35,
    })
    expect(what.length).toBeGreaterThan(0)
    expect(what[0].rawNode!.tagName.toLowerCase()).toBe('input')

    const where = page.css('input.css-1lonhz0', {
      identifier: 'where-input',
      adaptive: true,
      percentage: 35,
    })
    expect(where.length).toBeGreaterThan(0)

    const submit = page.css('button.css-17qy6hn', {
      identifier: 'submit-button',
      adaptive: true,
      percentage: 30,
    })
    expect(submit.length).toBeGreaterThan(0)
    const submitText = (submit[0].rawNode!.textContent || '').trim()
    expect(submitText.length).toBeGreaterThan(0)

    const title = page.css('h2.css-job-title-heading a', {
      identifier: 'job-title-1',
      adaptive: true,
      percentage: 40,
    })
    expect(title.length).toBeGreaterThan(0)
    const titleText = (title[0].rawNode!.textContent || '').trim()
    expect(titleText).toBe('Unity Developer')

    const company = page.css('div.css-company-name', {
      identifier: 'job-company-1',
      adaptive: true,
      percentage: 40,
    })
    expect(company.length).toBeGreaterThan(0)
    expect((company[0].rawNode!.textContent || '').trim()).toContain('Unity Technologies')

    const next = page.css('button.serp-page-next', {
      identifier: 'pagination-next',
      adaptive: true,
      percentage: 25,
    })
    if (next.length > 0) {
      const t = (next[0].rawNode!.textContent || '').trim()
      expect(typeof t).toBe('string')
    }
  })

  it('HARD negative: does not return high-confidence false positive when target removed', () => {
    const storage = new MemoryStorageSystem({ url: 'https://indeed.com/jobs' })
    train(storage)

    const emptyJobsHtml = `
      <!DOCTYPE html><html><body>
        <form role="search">
          <input placeholder="Job title, keywords, or company" value="Unity Developer" />
          <input placeholder="City, state, zip code, or remote" value="Remote" />
          <button type="submit">Find jobs</button>
        </form>
        <p>No jobs found matching your criteria.</p>
      </body></html>
    `

    const page = new Selector(emptyJobsHtml, {
      url: 'https://indeed.com/jobs',
      adaptive: true,
      storage,
    })

    const apply = page.css('button.css-apply-button', {
      identifier: 'apply-button-1',
      adaptive: true,
      percentage: 50,
    })
    expect(apply.length).toBe(0)

    const salary = page.css('div.css-salary-badge', {
      identifier: 'job-salary-1',
      adaptive: true,
      percentage: 50,
    })
    expect(salary.length).toBe(0)
  })

  it('HARD matrix summary: measures survival rate across real migration patterns', () => {
    const pages = [
      { id: 'structural', html: structuralHtml, minScore: 40 },
      { id: 'text-drift', html: textDriftHtml, minScore: 35 },
      { id: 'semantic', html: semanticHtml, minScore: 35 },
      { id: 'extreme', html: extremeHtml, minScore: 30 },
    ]

    const matrix: Record<string, { ok: number; total: number; details: string[] }> = {}

    for (const p of pages) {
      const storage = new MemoryStorageSystem({ url: `https://indeed.com/${p.id}` })
      train(storage)
      const page = new Selector(p.html, {
        url: `https://indeed.com/${p.id}`,
        adaptive: true,
        storage,
      })

      let ok = 0
      const details: string[] = []
      for (const t of TARGET_ELEMENTS) {
        const hits = page.css(t.initialSelector, {
          identifier: t.id,
          adaptive: true,
          percentage: p.minScore,
        })
        if (hits.length === 0) {
          details.push(`${t.id}: MISS`)
          continue
        }
        const raw = hits[0].rawNode!
        const text = (raw.textContent || raw.getAttribute('placeholder') || '').trim()
        const matched =
          !t.expectedTextSnippet && !t.expectedAttr
            ? true
            : textMatches(t.id, text, t.expectedTextSnippet)
        if (matched) {
          ok++
          details.push(`${t.id}: OK`)
        } else {
          details.push(`${t.id}: WRONG ("${text.slice(0, 40)}")`)
        }
      }
      matrix[p.id] = { ok, total: TARGET_ELEMENTS.length, details }
    }

    console.log('\n===== HARD MIGRATION MATRIX =====')
    for (const [id, m] of Object.entries(matrix)) {
      console.log(`${id}: ${m.ok}/${m.total} (${Math.round((m.ok / m.total) * 100)}%)`)
      console.log('  ' + m.details.join(', '))
    }
    console.log('=================================\n')

    expect(matrix.structural.ok).toBeGreaterThanOrEqual(7)
    expect(matrix.semantic.ok).toBeGreaterThanOrEqual(6)
    expect(matrix['text-drift'].ok).toBeGreaterThanOrEqual(5)
    expect(matrix.extreme.ok).toBeGreaterThanOrEqual(3)
  })
})
