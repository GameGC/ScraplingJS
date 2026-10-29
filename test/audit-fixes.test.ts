import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  configureStorage,
  MemoryStorageSystem,
  resetStorageConfiguration,
  Selector,
} from '../src'

describe('release audit regressions', () => {
  beforeEach(() => {
    MemoryStorageSystem.clearAll()
  })

  afterEach(() => {
    resetStorageConfiguration()
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

  it('reads page.url() so fromPage fingerprints are scoped to the page URL', async () => {
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

  it('fromDocument loads storage before exposing the sync query API', async () => {
    const doc = document.implementation.createHTMLDocument('extension')
    doc.body.innerHTML = '<button class="buy" data-kind="cta">Buy</button>'
    let loadCalls = 0
    const storage = new MemoryStorageSystem({
      url: 'https://extension.example.com/page',
      loadAll: async () => {
        loadCalls += 1
        return {
          buy: {
            tag: 'button',
            attributes: { class: 'buy' },
            text: 'Buy',
            path: ['html', 'body', 'button'],
          },
        }
      },
    })

    const page = await Selector.fromDocument(doc, {
      storage,
      url: 'https://extension.example.com/page',
    })

    expect(loadCalls).toBe(1)
    expect(page.url).toBe('https://extension.example.com/page')
    const button = page.css('.buy')[0]
    expect(button.attr('data-kind')).toBe('cta')
    expect(page.retrieve('buy')?.text).toBe('Buy')
  })

  it('configures storage once and accepts a url as the factory second argument', async () => {
    const url = 'https://shop.example.com/product/x100'
    let loadCalls = 0
    configureStorage(MemoryStorageSystem, {
      loadAll: async () => {
        loadCalls += 1
        return {
          buy: {
            tag: 'button',
            attributes: { class: 'buy' },
            text: 'Buy',
            path: ['html', 'body', 'button'],
          },
        }
      },
    })

    const doc = document.implementation.createHTMLDocument('configured')
    doc.body.innerHTML = '<button class="buy">Buy</button>'
    const page = await Selector.fromDocument(doc, url)

    expect(page.url).toBe(url)
    expect(loadCalls).toBe(1)
    expect(page.css('.buy').length).toBe(1)
    expect(page.retrieve('buy')?.text).toBe('Buy')
  })

  it('passes the page URL and raw keys to save/loadAll callbacks', async () => {
    const events: string[] = []
    configureStorage(MemoryStorageSystem, {
      loadAll: async (url) => {
        events.push(`loadAll:${url}`)
        return {}
      },
      save: async (url, key, fingerprint) => {
        events.push(`save:${url}:${key}:${fingerprint.tag}`)
      },
    })

    const doc = document.implementation.createHTMLDocument('callbacks')
    doc.body.innerHTML = '<button class="buy">Buy</button>'
    const page = await Selector.fromDocument(doc, 'https://shop.example.com/product/1')
    page.css('.buy')
    page.retrieve('missing')
    await (page._storage as MemoryStorageSystem).flush()

    expect(events).toEqual([
      'loadAll:https://shop.example.com/product/1',
      'save:https://shop.example.com/product/1:.buy:button',
    ])
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
})
