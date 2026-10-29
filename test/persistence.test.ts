import { describe, expect, it } from 'vitest'
import {
  MemoryStorageSystem,
  PagePersistenceManager,
  browserDomAdapter,
  isHiddenElement,
  searchSnapshot,
  type DomAdapter,
  type ElementFingerprint,
} from '../src'

describe('Chrome Extension Page Persistence & Browser Features', () => {
  it('persists and auto-relocates live DOM elements across mutations via PagePersistenceManager', async () => {
    const container = document.createElement('div')
    container.innerHTML = `
      <div class="app-shell">
        <div class="card" id="checkout-btn-card">
          <button id="buy-now" class="btn primary">Buy Now</button>
        </div>
      </div>
    `
    document.body.appendChild(container)

    const manager = new PagePersistenceManager({
      document,
      url: 'https://shop.example.com/item/1',
      debounceMs: 10,
    })

    const events: Array<{ tag: string; relocated: boolean; text: string }> = []
    const stopWatching = manager.watch('#buy-now', (el, relocated) => {
      events.push({
        tag: el.tagName.toLowerCase(),
        relocated,
        text: el.textContent?.trim() ?? '',
      })
    })

    expect(events.length).toBe(1)
    expect(events[0]).toEqual({ tag: 'button', relocated: false, text: 'Buy Now' })

    container.innerHTML = `
      <main class="redesigned-shell">
        <section class="action-area">
          <button data-action="purchase" class="btn-v2 primary">Buy Now</button>
        </section>
      </main>
    `

    await new Promise((r) => setTimeout(r, 60))

    expect(events.length).toBe(2)
    expect(events[1].tag).toBe('button')
    expect(events[1].relocated).toBe(true)
    expect(events[1].text).toBe('Buy Now')

    stopWatching()
    await manager.destroy()
    container.remove()
  })




  it('supports custom save/loadAll buckets with MemoryStorageSystem and PagePersistenceManager', async () => {
    const el = document.createElement('a')
    el.setAttribute('href', '/profile')
    el.className = 'nav-link'
    el.textContent = 'My Profile'
    const url = 'https://app.example.com'

    const buckets = new Map<string, Record<string, ElementFingerprint>>()
    const save = (bucketUrl: string, key: string, fingerprint: ElementFingerprint): void => {
      buckets.set(bucketUrl, {
        ...(buckets.get(bucketUrl) ?? {}),
        [key]: fingerprint,
      })
    }
    const loadAll = (bucketUrl: string): Record<string, ElementFingerprint> =>
      buckets.get(bucketUrl) ?? {}

    const storage = new MemoryStorageSystem({ url, save, loadAll })
    storage.save(el, 'profile-link')
    expect(storage.retrieve('profile-link')?.text).toBe('My Profile')
    expect(buckets.get(url)?.['profile-link']?.text).toBe('My Profile')

    storage.delete('profile-link')
    expect(storage.retrieve('profile-link')).toBeNull()
    await storage.load()
    expect(storage.retrieve('profile-link')?.text).toBe('My Profile')

    const manager = new PagePersistenceManager({
      document,
      url,
      storage,
    })
    storage.save(el, 'manager-profile')
    expect(manager.page.retrieve('manager-profile')?.text).toBe('My Profile')
    await manager.destroy()
  })

  it('detects hidden elements and searches snapshots', () => {
    const div1 = document.createElement('div')
    div1.setAttribute('style', 'display: none !important')
    expect(isHiddenElement(div1)).toBe(true)

    const div2 = document.createElement('div')
    div2.setAttribute('style', 'opacity: 0.95; line-height: 0')
    expect(isHiddenElement(div2)).toBe(false)

    const snap = [
      '- document:',
      '  - main:',
      '    - article:',
      '      - heading "Target Item"',
      '      - paragraph "Price $10"',
      '    - footer:',
      '      - text "Copyright"',
    ].join('\n')
    const filtered = searchSnapshot(snap, /Target Item/)
    expect(filtered).toContain('- document:')
    expect(filtered).toContain('heading "Target Item"')
  })



  it('debounces a burst of mutations into one evaluation instead of one per batch', async () => {
    let fire: (() => void) | null = null
    const adapter: DomAdapter = {
      ...browserDomAdapter,
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

    const manager = new PagePersistenceManager({
      document,
      dom: adapter,
      debounceMs: 5,
      adaptiveDomain: 'waiter-debounce',
    })

    let checks = 0
    const pending = manager.waitUntil(() => {
      checks++
      return null
    }, 500, 100)

    expect(checks).toBe(1)
    for (let i = 0; i < 50; i++) {
      fire?.()
    }
    expect(checks).toBe(1)

    await new Promise((resolve) => setTimeout(resolve, 40))
    expect(checks).toBe(2)

    await manager.destroy()
    await pending
  })

  it('runs pseudo-CSS and bare $variable selectors as CSS instead of searching for their literal text', () => {
    const container = document.createElement('div')
    container.innerHTML = `
      <ul id="modes">
        <li data-sku="SKU-1">Alpha</li>
        <li data-sku="SKU-2">Beta</li>
      </ul>
      <p class="note">Amount: $10 (approx</p>
    `
    document.body.appendChild(container)

    const manager = new PagePersistenceManager({
      document,
      url: 'https://modes.example.com',
    })

    expect(manager.find('li:contains("Beta")')?.textContent).toBe('Beta')
    expect(manager.findAll('li:contains("Al")').length).toBe(1)
    expect(
      manager
        .resolve('li[data-sku=$sku]', { variables: { sku: 'SKU-2' } })[0]
        ?.text.toString(),
    ).toBe('Beta')
    expect(manager.find('Amount: $10 (approx')?.textContent).toContain('Amount')

    container.remove()
  })
})
