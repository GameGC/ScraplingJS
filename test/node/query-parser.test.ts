import { describe, expect, it } from 'vitest'
import { detectQueryMode } from '../../src/persistence/query-parser'
import { createLinkedomAdapter } from './support/linkedom-adapter'

describe('detectQueryMode outside a browser', () => {
  it('has no DOM to probe with, which is the case under test', () => {
    expect(typeof document).toBe('undefined')
    expect(typeof DOMParser).toBe('undefined')
  })

  it('honours explicit modes and the XPath/text prefixes', () => {
    expect(detectQueryMode('//li')).toBe('xpath')
    expect(detectQueryMode('(//li)[1]')).toBe('xpath')
    expect(detectQueryMode('text=Submit')).toBe('text')
    expect(detectQueryMode('text:Submit')).toBe('text')
    expect(detectQueryMode('//li', 'text')).toBe('text')
    expect(detectQueryMode('button', 'xpath')).toBe('xpath')
  })

  it('classifies queries the bundled translator runs as CSS', () => {
    expect(detectQueryMode('ul.items > li[data-sku="SKU-1"]')).toBe('css')
    expect(detectQueryMode('li:nth-child(2)')).toBe('css')
    expect(detectQueryMode('.item + .item')).toBe('css')
  })

  it('classifies strings CSS cannot express as text instead of forcing CSS', () => {
    expect(detectQueryMode('Amount: $10 (approx')).toBe('text')
    expect(detectQueryMode('li)')).toBe('text')
    expect(detectQueryMode('div[')).toBe('text')
    expect(detectQueryMode("it's a 'quote")).toBe('text')
  })

  it('keeps using the DOM probe when a document is available', () => {
    const doc = createLinkedomAdapter().parseHtml(
      '<div id="app"><ul><li class="item">Alpha</li></ul></div>',
    )

    expect(detectQueryMode('li.item', undefined, doc)).toBe('css')
    expect(detectQueryMode('div[', undefined, doc)).toBe('text')
    expect(detectQueryMode('//li', undefined, doc)).toBe('xpath')
    // `:hover` is real CSS for a DOM, but not something this library can run:
    // with a document the DOM decides, without one the translator does.
    expect(detectQueryMode('li:hover', undefined, doc)).toBe('css')
    expect(detectQueryMode('li:hover')).toBe('text')
  })
})
