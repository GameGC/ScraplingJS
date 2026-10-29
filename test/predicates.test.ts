import { beforeEach, describe, expect, it } from 'vitest'
import {
  MemoryStorageSystem,
  PagePersistenceManager,
  Selector,
  type ElementFingerprint,
  type StorageErrorHandler,
  type StorageLoadAllPredicate,
  type StorageSavePredicate,
  type StorageSystem,
} from '../src'
import { chromeStorage, localStorageStorage } from '../examples/storage'

interface LocalStoragePersistenceOptions {
  prefix?: string
  storage?: Storage
}

interface LocalStoragePersistenceBundle {
  save: StorageSavePredicate
  loadAll: StorageLoadAllPredicate
  onError: StorageErrorHandler
}

function createLocalStoragePersistence(
  options: LocalStoragePersistenceOptions = {},
): LocalStoragePersistenceBundle {
  const prefix = options.prefix ?? 'scrapling:'
  const store = options.storage ?? window.localStorage

  const readBucket = (url: string): Record<string, ElementFingerprint> => {
    try {
      const raw = store.getItem(`${prefix}${url}`)
      if (!raw) return {}

      const parsed: unknown = JSON.parse(raw)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, ElementFingerprint>)
        : {}
    } catch {
      return {}
    }
  }

  const save: StorageSavePredicate = (url, key, fingerprint): void => {
    try {
      store.setItem(
        `${prefix}${url}`,
        JSON.stringify({
          ...readBucket(url),
          [key]: fingerprint,
        }),
      )
    } catch (err: unknown) {
      if (
        err instanceof DOMException &&
        (err.name === 'QuotaExceededError' || err.code === 22 || err.name === 'NS_ERROR_DOM_QUOTA_REACHED')
      ) {
        throw new Error(`LocalStorage quota exceeded while saving key "${key}"`)
      }
      throw err
    }
  }

  const loadAll: StorageLoadAllPredicate = (url) => readBucket(url)

  const onError: StorageErrorHandler = (error: unknown, context) => {
    void error
    void context
  }

  return { save, loadAll, onError }
}

describe('Storage persistence with save/loadAll buckets', () => {
  beforeEach(() => {
    MemoryStorageSystem.clearAll()
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear()
    }
  })

  it('stores multiple selectors in one URL bucket and restores them', async () => {
    const persistence = createLocalStoragePersistence({ prefix: 'test-app:' })
    const url = 'https://example.com/products'
    const storage = new MemoryStorageSystem({
      url,
      save: persistence.save,
      loadAll: persistence.loadAll,
      onError: persistence.onError,
    })

    storage.save(
      {
        tag: 'button',
        attributes: { id: 'submit-btn', class: 'btn primary' },
        text: 'Submit Order',
        path: ['html', 'body', 'button'],
      },
      'order-button',
    )
    storage.save(
      {
        tag: 'a',
        attributes: { class: 'cart-link' },
        text: 'Cart',
        path: ['html', 'body', 'a'],
      },
      'cart-link',
    )

    const rawBucket = window.localStorage.getItem(`test-app:${url}`)
    expect(rawBucket).not.toBeNull()
    expect(rawBucket).toContain('order-button')
    expect(rawBucket).toContain('cart-link')

    const fresh = new MemoryStorageSystem({ url, loadAll: persistence.loadAll })
    await fresh.load()

    expect(fresh.retrieve('order-button')?.text).toBe('Submit Order')
    expect(fresh.retrieve('cart-link')?.text).toBe('Cart')

    window.localStorage.setItem(`test-app:${url}`, '{not valid json')
    MemoryStorageSystem.clearAll()
    const corrupt = new MemoryStorageSystem({ url, loadAll: persistence.loadAll })
    await corrupt.load()
    expect(corrupt.retrieve('order-button')).toBeNull()
  })

  it('runs the documented localStorage adapter', async () => {
    const url = 'https://docs.example.com/page'
    const storage = new MemoryStorageSystem({
      url,
      save: localStorageStorage.save,
      loadAll: localStorageStorage.loadAll,
    })

    storage.save(
      {
        tag: 'button',
        attributes: { class: 'cta' },
        text: 'Buy',
        path: ['button'],
      },
      'cta',
    )

    const raw = window.localStorage.getItem(url)
    expect(raw).toContain('cta')

    MemoryStorageSystem.clearAll()
    const fresh = new MemoryStorageSystem({ url, loadAll: localStorageStorage.loadAll })
    await fresh.load()
    expect(fresh.retrieve('cta')?.text).toBe('Buy')
  })

  it('serializes chrome.storage.local bucket writes', async () => {
    const url = 'https://chrome.example.com/page'
    const buckets = new Map<string, unknown>()
    const chromeMock = {
      storage: {
        local: {
          async get(key: string): Promise<Record<string, unknown>> {
            return { [key]: buckets.get(key) }
          },
          async set(items: Record<string, unknown>): Promise<void> {
            for (const [key, value] of Object.entries(items)) {
              buckets.set(key, value)
            }
          },
        },
      },
    }

    const globalWithChrome = globalThis as typeof globalThis & { chrome?: unknown }
    const originalChrome = globalWithChrome.chrome
    globalWithChrome.chrome = chromeMock

    try {
      const makeFp = (text: string): ElementFingerprint => ({
        tag: 'button',
        attributes: { class: 'cta' },
        text,
        path: ['button'],
      })

      await Promise.all([
        chromeStorage.save(url, 'first', makeFp('First')),
        chromeStorage.save(url, 'second', makeFp('Second')),
      ])

      const bucket = await chromeStorage.loadAll(url)
      expect(bucket.first?.text).toBe('First')
      expect(bucket.second?.text).toBe('Second')
    } finally {
      globalWithChrome.chrome = originalChrome
    }
  })

  it('reports localStorage quota failures with the failing key', () => {
    const persistence = createLocalStoragePersistence({ prefix: 'quota-app:' })
    const url = 'https://quota.example.com'
    const fingerprint: ElementFingerprint = {
      tag: 'button',
      attributes: { id: 'quota-btn' },
      text: 'Quota',
      path: ['button'],
    }

    const originalSetItem = window.localStorage.setItem.bind(window.localStorage)
    try {
      window.localStorage.setItem = () => {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
      }
      expect(() => persistence.save(url, 'quota-key', fingerprint)).toThrow(/quota exceeded/i)
    } finally {
      window.localStorage.setItem = originalSetItem
    }
  })

  it('supports synchronous save callbacks with honest error reporting via onError', () => {
    const backend = new Map<string, ElementFingerprint>()
    const errors: string[] = []
    const url = 'https://shop.example.com'

    const storage = new MemoryStorageSystem({
      url,
      save: (_url, key, fp) => {
        if (key.includes('failing')) {
          throw new Error('Simulated disk write failure')
        }
        backend.set(key, fp)
      },
      onError: (err, ctx) => {
        const msg = err instanceof Error ? err.message : String(err)
        errors.push(`${ctx.operation}:${ctx.key ?? 'none'}:${msg}`)
      },
    })

    const fp: ElementFingerprint = {
      tag: 'div',
      attributes: { class: 'card' },
      text: 'Item Card',
      path: ['div'],
    }

    storage.save(fp, 'good-item')
    expect(backend.has('good-item')).toBe(true)

    storage.save(fp, 'failing-item')
    expect(errors.length).toBe(1)
    expect(errors[0]).toContain('save:https://shop.example.com:::failing-item:Simulated disk write failure')
  })

  it('supports asynchronous save callbacks without blocking synchronous queries', async () => {
    const backend = new Map<string, ElementFingerprint>()
    const errors: string[] = []

    const storage = new MemoryStorageSystem({
      url: 'https://async.example.com',
      save: async (_url, key, fp) => {
        await new Promise((resolve) => setTimeout(resolve, 5))
        if (key.includes('async-fail')) {
          throw new Error('Async network drop')
        }
        backend.set(key, fp)
      },
      onError: (err, ctx) => {
        const msg = err instanceof Error ? err.message : String(err)
        errors.push(`${ctx.operation}:${ctx.key ?? 'none'}:${msg}`)
      },
    })

    const fp: ElementFingerprint = {
      tag: 'span',
      attributes: { id: 'badge' },
      text: 'New',
      path: ['span'],
    }

    storage.save(fp, 'async-item')
    expect(storage.retrieve('async-item')?.text).toBe('New')

    await storage.flush()
    expect(backend.has('async-item')).toBe(true)

    storage.save(fp, 'async-fail-item')
    await storage.flush()
    expect(errors.length).toBe(1)
    expect(errors[0]).toContain('save:https://async.example.com:::async-fail-item:Async network drop')
  })

  it('keeps newer in-memory entries when an older snapshot is loaded', async () => {
    const url = 'https://merge.example.com'
    const storage = new MemoryStorageSystem({ url })

    storage.save(
      {
        tag: 'button',
        attributes: { class: 'btn primary' },
        text: 'New Active Label',
        path: ['button'],
      },
      'checkout-btn',
    )

    await storage.load({
      [`${url}:::checkout-btn`]: {
        tag: 'button',
        attributes: { class: 'btn old' },
        text: 'Old Stale Label',
        path: ['button'],
      },
      [`${url}:::footer-link`]: {
        tag: 'a',
        attributes: { href: '/terms' },
        text: 'Terms of Service',
        path: ['a'],
      },
    })

    expect(storage.retrieve('checkout-btn')?.text).toBe('New Active Label')
    expect(storage.retrieve('checkout-btn')?.attributes.class).toBe('btn primary')
    expect(storage.retrieve('footer-link')?.text).toBe('Terms of Service')
  })

  it('rejects malformed fingerprints during loading and reports them to onError', async () => {
    const reportedErrors: string[] = []
    const url = 'https://validation.example.com'
    const storage = new MemoryStorageSystem({
      url,
      onError: (err, ctx) => {
        const msg = err instanceof Error ? err.message : String(err)
        reportedErrors.push(`${ctx.operation}:${ctx.key ?? 'none'}:${msg}`)
      },
    })

    await storage.load({
      [`${url}:::corrupt-no-tag`]: {
        attributes: { class: 'test' },
        path: ['div'],
      } as unknown as ElementFingerprint,
      [`${url}:::corrupt-not-obj`]: 'string-not-fingerprint' as unknown as ElementFingerprint,
    })

    expect(reportedErrors.length).toBe(2)
    expect(storage.retrieve('corrupt-no-tag')).toBeNull()
    expect(storage.retrieve('corrupt-not-obj')).toBeNull()
  })

  it('enforces bounded capacity eviction on LRU buckets when capacity is reached', () => {
    const storage = new MemoryStorageSystem({
      storageFile: 'lru-bounded-bucket',
      capacity: 3,
      url: 'https://lru.example.com',
    })

    const makeFp = (id: string): ElementFingerprint => ({
      tag: 'div',
      attributes: { id },
      text: `Content for ${id}`,
      path: ['div'],
    })

    storage.save(makeFp('item-1'), 'item-1')
    storage.save(makeFp('item-2'), 'item-2')
    storage.save(makeFp('item-3'), 'item-3')

    expect(storage.retrieve('item-1')).not.toBeNull()
    expect(storage.retrieve('item-2')).not.toBeNull()
    expect(storage.retrieve('item-3')).not.toBeNull()

    storage.retrieve('item-1')
    storage.save(makeFp('item-4'), 'item-4')

    expect(storage.retrieve('item-2')).toBeNull()
    expect(storage.retrieve('item-1')).not.toBeNull()
    expect(storage.retrieve('item-3')).not.toBeNull()
    expect(storage.retrieve('item-4')).not.toBeNull()
  })

  it('bounds the global file buckets to MAX_GLOBAL_BUCKETS', () => {
    MemoryStorageSystem.clearAll()
    expect(MemoryStorageSystem.MAX_GLOBAL_BUCKETS).toBe(100)

    for (let i = 0; i < 110; i++) {
      const store = new MemoryStorageSystem({
        storageFile: `test-db-bucket-${i}`,
        url: 'https://leaks.example.com',
      })
      store.save(
        {
          tag: 'span',
          attributes: { 'data-index': String(i) },
          text: `Index ${i}`,
          path: ['span'],
        },
        'token',
      )
    }

    expect(MemoryStorageSystem.globalBuckets.size).toBeLessThanOrEqual(100)
    expect(MemoryStorageSystem.globalBuckets.has('test-db-bucket-0')).toBe(false)
    expect(MemoryStorageSystem.globalBuckets.has('test-db-bucket-109')).toBe(true)
  })

  it('integrates custom buckets with PagePersistenceManager across DOM mutations', async () => {
    const container = document.createElement('div')
    container.innerHTML = `
      <section class="storefront">
        <button id="add-to-cart" class="btn green" data-sku="12345">Add to Cart</button>
      </section>
    `
    document.body.appendChild(container)

    const url = 'https://storefront.example.com/item'
    const buckets = new Map<string, Record<string, ElementFingerprint>>()
    const storage = new MemoryStorageSystem({
      url,
      save: (bucketUrl, key, fp) => {
        buckets.set(bucketUrl, { ...(buckets.get(bucketUrl) ?? {}), [key]: fp })
      },
      loadAll: (bucketUrl) => buckets.get(bucketUrl) ?? {},
    })
    const manager = new PagePersistenceManager({
      document,
      url,
      storage,
      debounceMs: 10,
    })

    const initialBtn = manager.page.css('#add-to-cart', {
      identifier: 'add-to-cart',
      autoSave: true,
    })
    expect(initialBtn.length).toBe(1)
    expect(buckets.get(url)?.['add-to-cart']).toBeTruthy()

    MemoryStorageSystem.clearAll()
    container.innerHTML = `
      <div class="redesigned-storefront">
        <button class="btn green new-style" data-sku="12345">Add to Cart</button>
      </div>
    `

    const relocated = manager.page.css('#add-to-cart', { identifier: 'add-to-cart' })
    expect(relocated.length).toBe(1)
    expect(relocated[0].hasClass('new-style')).toBe(true)

    await manager.destroy()
    container.remove()
  })



  it('throws on unresolved async custom StorageSystem.retrieve from Selector', async () => {
    let unhandledTriggered = false
    const onUnhandled = () => {
      unhandledTriggered = true
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('unhandledrejection', onUnhandled)
    }

    let rejectPromise: ((reason?: unknown) => void) | undefined
    const customStorage: StorageSystem = {
      save: () => {},
      retrieve: () =>
        new Promise((_, reject) => {
          rejectPromise = reject
        }),
    }

    const sel = new Selector('<div id="root">Hello</div>', { storage: customStorage })

    expect(() => {
      sel.retrieve('custom-async-btn')
    }).toThrow(
      'Storage returned an unresolved Promise for identifier "custom-async-btn" during synchronous retrieval. Call "await storage.load()" or use synchronous storage before querying.',
    )

    rejectPromise?.(new Error('Simulated async storage rejection'))
    await new Promise((resolve) => setTimeout(resolve, 50))

    if (typeof window !== 'undefined') {
      window.removeEventListener('unhandledrejection', onUnhandled)
    }

    expect(unhandledTriggered).toBe(false)
  })
})
