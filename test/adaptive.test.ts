import { beforeEach, describe, expect, it } from 'vitest'
import {
  MemoryStorageSystem,
  Selector,
  StorageSystemMixin,
  StorageTools,
} from '../src'

describe('Adaptive Element Relocation & Storage', () => {
  beforeEach(() => {
    MemoryStorageSystem.clearAll()
  })

  it('relocates elements across structural DOM changes', () => {
    const originalHtml = `
      <div class="container">
        <section class="products">
          <article class="product" id="p1">
            <h3>Product 1</h3>
            <p class="description">Description 1</p>
          </article>
          <article class="product" id="p2">
            <h3>Product 2</h3>
            <p class="description">Description 2</p>
          </article>
        </section>
      </div>
    `
    const changedHtml = `
      <div class="new-container">
        <div class="product-wrapper">
          <section class="products">
            <article class="product new-class" data-id="p1">
              <div class="product-info">
                <h3>Product 1</h3>
                <p class="new-description">Description 1</p>
              </div>
            </article>
            <article class="product new-class" data-id="p2">
              <div class="product-info">
                <h3>Product 2</h3>
                <p class="new-description">Description 2</p>
              </div>
            </article>
          </section>
        </div>
      </div>
    `

    const oldPage = new Selector(originalHtml, { url: 'example.com' })
    const newPage = new Selector(changedHtml, { url: 'example.com' })

    oldPage.css('#p1, #p2', { autoSave: true })
    const relocated = newPage.css('#p1', {})

    expect(relocated.length).toBeGreaterThan(0)
    expect(relocated[0].attrib['data-id'].toString()).toBe('p1')
    expect(relocated[0].hasClass('new-class')).toBe(true)
    expect(relocated[0].css('.new-description')[0].text.toString()).toBe('Description 1')
  })

  it('returns empty Selectors when no element exceeds threshold', () => {
    const originalHtml = `
      <div class="container">
        <article class="product" id="target">
          <h3>Widget</h3>
          <p class="desc">A widget</p>
        </article>
      </div>
    `
    const changedHtml = '<html><body><span>totally unrelated content</span></body></html>'

    const oldPage = new Selector(originalHtml, { url: 'example.com' })
    const newPage = new Selector(changedHtml, { url: 'example.com' })

    oldPage.css('#target', { identifier: 'target', autoSave: true })
    const result = newPage.css('#target', {
      identifier: 'target',
      autoSave: true,
      percentage: 95,
    })
    expect(Array.from(result)).toEqual([])
  })

  it('isolates adaptive storage by base domain and supports hash generation', () => {
    const storageA = new MemoryStorageSystem({
      storageFile: 'shared.db',
      url: 'https://www.site-a.com/products',
    })
    const storageB = new MemoryStorageSystem({
      storageFile: 'shared.db',
      url: 'https://www.site-b.com/products',
    })

    expect(storageA.getBaseUrl()).toBe('site-a.com')
    expect(storageB.getBaseUrl()).toBe('site-b.com')

    const pageA = new Selector('<div><p id="item">Hello</p></div>', {
      url: 'https://site-a.com',
      _storage: storageA,
    })
    pageA.css('#item', { identifier: 'shared-id', autoSave: true })

    expect(storageA.retrieve('shared-id')?.text).toBe('Hello')
    expect(storageB.retrieve('shared-id')).toBeNull()

    const h1 = StorageSystemMixin.getHash('  Hello  ')
    const h2 = StorageSystemMixin.getHash('hello')
    expect(h1).toBe(h2)
    expect(h1.endsWith('_5')).toBe(true)
  })

  it('serializes element fingerprint via StorageTools.elementToDict', () => {
    const page = new Selector(
      '<div><p>Sibling</p><span id="target" data-empty="  "><b>Child</b><i>Child2</i></span></div>',
    )
    const targetEl = page.css('#target')[0].rawNode!
    const dict = StorageTools.elementToDict(targetEl)

    expect(dict.tag).toBe('span')
    expect(dict.attributes).toEqual({ id: 'target' })
    expect(dict.parent_name).toBe('div')
    expect(dict.children).toEqual(['b', 'i'])
    expect(dict.siblings).toEqual(['p'])
    // Layout reads are opt-in: the default fingerprint must not force a reflow.
    expect(dict.rect).toBeUndefined()
  })

  it('relocates through a Selectors collection', () => {
    const oldPage = new Selector(
      '<div class="card"><span class="old-price">$42</span></div>',
      { url: 'example.com' },
    )
    const newPage = new Selector(
      '<div class="card"><span class="new-price">$42</span></div>',
      { url: 'example.com' },
    )

    oldPage.css('.card').css('.old-price', { identifier: 'price', autoSave: true })
    const relocated = newPage
      .css('.card')
      .css('.old-price', { identifier: 'price' })

    expect(relocated.length).toBe(1)
    expect(relocated[0].text.toString()).toBe('$42')
  })

  it('scores a relocation candidate with similarityTo', () => {
    const original = new Selector('<div class="card"><button>Buy</button></div>')
    const candidate = new Selector(
      '<div class="card"><button class="primary" type="button">Buy</button></div>',
    )

    const originalButton = original.css('button')[0]
    const candidateButton = candidate.css('button')[0]
    expect(originalButton.similarityTo(candidateButton)).toBeGreaterThan(50)
    expect(originalButton.similarityTo(originalButton)).toBeGreaterThan(90)
    expect(originalButton.similarityTo(candidateButton.rawNode as Element)).toBeGreaterThan(50)
  })

  it('does not duplicate a comma-group match after relocation', () => {
    const oldPage = new Selector(
      '<div class="card"><h1 class="old">Hero</h1></div>',
      { url: 'example.com' },
    )
    const newPage = new Selector(
      '<div class="card"><h2 class="fallback">Hero</h2></div>',
      { url: 'example.com' },
    )

    oldPage.css('h1.old', { identifier: 'hero-title', autoSave: true })
    const result = newPage.css('h1.old, h2.fallback', {
      identifier: 'hero-title',
      autoSave: true,
    })

    expect(result.length).toBe(1)
    expect(result[0].tag).toBe('h2')
  })
})
