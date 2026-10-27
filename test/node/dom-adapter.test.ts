import { afterEach, describe, expect, it } from 'vitest'
import {
  browserDomAdapter,
  DomAdapterError,
  PagePersistenceManager,
  Selector,
  getDomAdapter,
  setDomAdapter,
  type DomAdapter,
} from '../../src'
import { createLinkedomAdapter } from './support/linkedom-adapter'

const PAGE_HTML = `
<html>
<body>
<div id="app">
  <ul class="items">
    <li class="item" data-sku="SKU-1">Alpha</li>
    <li class="item" data-sku="SKU-2">Beta</li>
    <li class="item" data-sku="SKU-3">Gamma</li>
  </ul>
  <button class="cta" type="button">Apply</button>
</div>
</body>
</html>
`

function createObservingAdapter(): { adapter: DomAdapter; notify: () => void } {
  const base = createLinkedomAdapter()
  let fire: (() => void) | null = null
  const adapter: DomAdapter = {
    ...base,
    createObserver: (callback) => {
      fire = () => callback([])
      return {
        observe: () => {},
        disconnect: () => {
          fire = null
        },
      }
    },
  }
  return {
    adapter,
    notify: () => fire?.(),
  }
}

afterEach(() => {
  setDomAdapter(null)
})

describe('DomAdapter on the Node runtime', () => {
  it('runs without any browser globals', () => {
    expect(typeof document).toBe('undefined')
    expect(typeof DOMParser).toBe('undefined')
  })

  it('parses HTML and answers CSS, XPath, text and attribute queries', () => {
    const dom = createLinkedomAdapter()
    const page = new Selector(PAGE_HTML, { dom, adaptive: false })

    expect(page.css('ul.items > li').length).toBe(3)
    expect(page.xpath('//div[@id="app"]//li').length).toBe(3)
    expect(page.css('li').map((item) => String(item.text))).toEqual([
      'Alpha',
      'Beta',
      'Gamma',
    ])
    expect(page.css('li')[1].attr('data-sku')?.toString()).toBe('SKU-2')
    expect(page.css('#app')[0].generateCssSelector).toBe('#app')
    expect(String(page.getAllText())).toContain('Apply')
  })

  it('supports variables, findAll filters and similarity search through the adapter', () => {
    const dom = createLinkedomAdapter()
    const page = new Selector(PAGE_HTML, { dom, adaptive: false })

    expect(page.css('[data-sku="$sku"]', { sku: 'SKU-3' }).length).toBe(1)
    expect(page.css('[data-sku="$sku"]', { sku: 'SKU-3' })[0].text.toString()).toBe('Gamma')
    expect(page.findAll('li', { class: 'item' }).length).toBe(3)
    expect(page.css('li')[0].findSimilar(0.2).length).toBeGreaterThanOrEqual(2)
    expect(String(page.findByText('Apply'))).toContain('Apply')
  })

  it('uses the adapter registered with setDomAdapter as the default', () => {
    setDomAdapter(createLinkedomAdapter())
    expect(getDomAdapter().isElement({ nodeType: 1 })).toBe(true)

    const page = new Selector(PAGE_HTML, { adaptive: false })
    expect(page.css('button.cta').length).toBe(1)
  })

  it('explains how to configure an adapter instead of failing obscurely', () => {
    expect(() => new Selector('<div/>')).toThrowError(DomAdapterError)
    expect(() => new Selector('<div/>')).toThrowError(/setDomAdapter/)
    expect(() => browserDomAdapter.parseHtml('<div/>')).toThrowError(/DOMParser is not available/)
    expect(() => browserDomAdapter.createObserver(() => {})).toThrowError(/createObserver/)
    expect(() => new PagePersistenceManager({ dom: browserDomAdapter })).toThrowError(
      /needs a Document/,
    )
  })

  it('relocates a remembered element after the DOM shape changes', () => {
    const dom = createLinkedomAdapter()
    const source = dom.parseHtml(
      '<div id="app"><main><button class="cta" type="button">Apply</button></main></div>',
    )
    const writer = new PagePersistenceManager({
      document: source,
      dom,
      adaptiveDomain: 'node-relocate',
    })
    const target = writer.find('button.cta')
    expect(target).not.toBeNull()
    const info = writer.captureElement(target as Element)

    const mutated = dom.parseHtml(
      '<div id="app"><div class="shell"><main><button class="cta" type="button">Apply</button></main></div></div>',
    )
    const reader = new PagePersistenceManager({
      document: mutated,
      dom,
      adaptiveDomain: 'node-relocate',
    })
    const restored = reader.restore(info.identifier)

    expect(restored).not.toBeNull()
    expect(restored?.tagName.toLowerCase()).toBe('button')
    expect(restored?.textContent).toContain('Apply')
  })

  it('waits for elements by polling when the adapter has no observer', async () => {
    const dom = createLinkedomAdapter()
    const manager = new PagePersistenceManager({
      document: dom.parseHtml(PAGE_HTML),
      dom,
      adaptiveDomain: 'node-wait',
    })

    const present = await manager.waitFor('button.cta', { timeout: 50 })
    expect(present?.textContent).toBe('Apply')

    const missing = await manager.waitFor('table.missing', { timeout: 50 })
    expect(missing).toBeNull()
  })

  it('requires createObserver for live watchers and uses it when provided', async () => {
    const dom = createLinkedomAdapter()
    const plain = new PagePersistenceManager({
      document: dom.parseHtml(PAGE_HTML),
      dom,
      adaptiveDomain: 'node-watch',
    })

    expect(() => plain.watch('button.cta', () => {})).toThrowError(/createObserver/)
    expect(() => plain.watch('button.cta', () => {})).toThrowError(DomAdapterError)

    const { adapter, notify } = createObservingAdapter()
    const doc = adapter.parseHtml(PAGE_HTML)
    const manager = new PagePersistenceManager({
      document: doc,
      dom: adapter,
      debounceMs: 1,
      adaptiveDomain: 'node-watch',
    })

    const events: Array<{ relocated: boolean }> = []
    const stop = manager.watch('button.cta', (_element, relocated) => {
      events.push({ relocated })
    })
    expect(events).toEqual([{ relocated: false }])

    const button = doc.querySelector('button.cta')
    const replacement = doc.createElement('button')
    replacement.setAttribute('class', 'cta-primary')
    replacement.setAttribute('type', 'button')
    replacement.textContent = 'Apply'
    expect(button).not.toBeNull()
    button?.replaceWith(replacement)
    notify()
    await new Promise((resolve) => setTimeout(resolve, 25))

    expect(events.length).toBeGreaterThanOrEqual(2)
    expect(events.at(-1)?.relocated).toBe(true)
    stop()
  })
})
