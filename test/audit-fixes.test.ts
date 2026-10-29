import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryStorageSystem, Selector } from '../src'

describe('release audit regressions', () => {
  beforeEach(() => {
    MemoryStorageSystem.clearAll()
  })

  it('defaults autoSave to true for Selector.css, Selector.xpath, and Selectors.css', () => {
    const storage = new MemoryStorageSystem({ url: 'https://autosave.example.com' })
    const page = new Selector(
      '<div class="group"><span class="child">Child</span></div><div class="other">Other</div>',
      { url: 'https://autosave.example.com', storage },
    )

    page.css('.other')
    expect(storage.retrieve('.other')?.text).toBe('Other')

    page.xpath('//div[@class="other"]')
    expect(storage.retrieve('//div[@class="other"]')?.tag).toBe('div')

    page.css('.group').css('.child')
    expect(storage.retrieve('.child')?.text).toBe('Child')
  })

  it('still lets callers opt out of autoSave explicitly', () => {
    const storage = new MemoryStorageSystem({ url: 'https://autosave-optout.example.com' })
    const page = new Selector('<div class="item">Item</div>', {
      url: 'https://autosave-optout.example.com',
      storage,
    })

    page.css('.item', { autoSave: false })
    expect(storage.retrieve('.item')).toBeNull()
  })

  it('reads page.url() so fromPage fingerprints are scoped to the page domain', async () => {
    const url = 'https://shop.example.com/product/x100'
    const storage = new MemoryStorageSystem({ url })
    const page = await Selector.fromPage({
      content: async () => '<html><body><button class="buy">Buy</button></body></html>',
      url: () => url,
    })

    expect(page.url).toBe(url)
    page.css('.buy')
    expect(storage.retrieve('.buy')?.text).toBe('Buy')
  })

  it('does not strip comments or normalize text nodes in a caller-owned document', () => {
    const doc = document.implementation.createHTMLDocument('owned')
    doc.body.innerHTML = 'alpha<!-- keep me -->beta'
    const before = doc.body.childNodes.length

    new Selector(doc)

    expect(doc.body.childNodes.length).toBe(before)
    expect(doc.body.innerHTML).toContain('<!-- keep me -->')
  })

  it('returns primitive strings from attr() and keeps dot access for Selector members', () => {
    const page = new Selector('<a href="/x" text="attr-text">Link</a>')
    const link = page.css('a')[0]

    expect(link.attr('href')).toBe('/x')
    expect(typeof link.attr('href')).toBe('string')
    expect(link.attr('text')).toBe('attr-text')
    expect(link.attr('missing')).toBeNull()
    expect(String(link.text)).toBe('Link')
  })

  it('reports an unhydrated async read predicate once in the error message', () => {
    const storage = new MemoryStorageSystem({
      url: 'https://hydrate-message.example.com',
      read: () => Promise.resolve(null),
    })

    let message = ''
    try {
      storage.retrieve('key')
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }

    expect(message.match(/await storage\.hydrate\(\)/g)).toHaveLength(1)
  })
})
