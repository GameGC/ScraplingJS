import { beforeEach, describe, expect, it } from 'vitest'
import {
  MemoryStorageSystem,
  PagePersistenceManager,
  Selector,
  createScrapling,
  isValidFingerprint,
  type ElementFingerprint,
  type StorageErrorHandler,
  type StorageHydrateSource,
  type StorageReadPredicate,
  type StorageSavePredicate,
  type StorageSystem,
} from '../src'

interface LocalStoragePersistenceOptions {
  prefix?: string
  storage?: Storage
}

interface LocalStoragePersistenceBundle {
  save: StorageSavePredicate
  read: StorageReadPredicate
  hydrate: StorageHydrateSource
  onError: StorageErrorHandler
}

function createLocalStoragePersistence(
  options: LocalStoragePersistenceOptions = {},
): LocalStoragePersistenceBundle {
  const prefix = options.prefix ?? 'scrapling:'
  const store = options.storage ?? (typeof window !== 'undefined' ? window.localStorage : null)

  const save: StorageSavePredicate = (key: string, fingerprint: ElementFingerprint): void => {
    if (!store) return
    const serialized = JSON.stringify(fingerprint)
    try {
      store.setItem(`${prefix}${key}`, serialized)
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

  const read: StorageReadPredicate = (key: string): ElementFingerprint | null => {
    if (!store) return null
    try {
      const raw = store.getItem(`${prefix}${key}`)
      if (!raw) return null
      const parsed: unknown = JSON.parse(raw)
      return isValidFingerprint(parsed) ? parsed : null
    } catch {
      return null
    }
  }

  const hydrate: StorageHydrateSource = async (): Promise<Record<string, ElementFingerprint>> => {
    const records: Record<string, ElementFingerprint> = {}
    if (!store) return records
    for (let i = 0; i < store.length; i++) {
      const storageKey = store.key(i)
      if (storageKey && storageKey.startsWith(prefix)) {
        const raw = store.getItem(storageKey)
        if (raw) {
          try {
            const parsed: unknown = JSON.parse(raw)
            if (isValidFingerprint(parsed)) {
              const origKey = storageKey.slice(prefix.length)
              records[origKey] = parsed
            }
          } catch {}
        }
      }
    }
    return records
  }

  const onError: StorageErrorHandler = (error: unknown, context: { operation: 'save' | 'read' | 'hydrate'; key?: string }): void => {
    const message = error instanceof Error ? error.message : String(error)
    void message
    void context
  }

  return { save, read, hydrate, onError }
}

describe('Custom Save/Read Persistence Predicates & LocalStorage Integration', () => {
  beforeEach(() => {
    MemoryStorageSystem.clearAll()
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear()
    }
  })

  it('provides a production-grade localStorage-backed persistence example with quota handling and hydration', async () => {
    const reportedErrors: Array<{ message: string; op: string }> = []
    const persistence = createLocalStoragePersistence({ prefix: 'test-app:' })
    const customOnError: StorageErrorHandler = (error, context) => {
      reportedErrors.push({
        message: error instanceof Error ? error.message : String(error),
        op: context.operation,
      })
    }

    const storage = new MemoryStorageSystem({
      url: 'https://example.com/products',
      save: persistence.save,
      read: persistence.read,
      hydrate: persistence.hydrate,
      onError: customOnError,
    })

    const sampleFingerprint: ElementFingerprint = {
      tag: 'button',
      attributes: { id: 'submit-btn', class: 'btn primary' },
      text: 'Submit Order',
      path: ['html', 'body', 'button'],
      depth: 2,
    }

    storage.save(sampleFingerprint, 'order-button')
    const rawSaved = window.localStorage.getItem('test-app:example.com:::order-button')
    expect(rawSaved).not.toBeNull()
    expect(rawSaved).toContain('Submit Order')

    MemoryStorageSystem.clearAll()

    const restored = storage.retrieve('order-button')
    expect(restored).not.toBeNull()
    expect(restored?.text).toBe('Submit Order')

    window.localStorage.setItem('test-app:example.com:::corrupt', '{not valid json')
    const corruptRead = persistence.read('example.com:::corrupt')
    expect(corruptRead).toBeNull()

    window.localStorage.setItem(
      'test-app:example.com:::preloaded',
      JSON.stringify({
        tag: 'h1',
        attributes: { class: 'title' },
        text: 'Preloaded Heading',
        path: ['html', 'body', 'h1'],
      }),
    )

    const freshStorage = new MemoryStorageSystem({
      url: 'https://example.com/products',
      hydrate: persistence.hydrate,
    })

    await freshStorage.hydrate()
    const preloadedResult = freshStorage.retrieve('preloaded')
    expect(preloadedResult).not.toBeNull()
    expect(preloadedResult?.text).toBe('Preloaded Heading')

    const originalSetItem = window.localStorage.setItem.bind(window.localStorage)
    try {
      window.localStorage.setItem = () => {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
      }
      expect(() => {
        persistence.save('quota-key', sampleFingerprint)
      }).toThrow(/quota exceeded/i)
    } finally {
      window.localStorage.setItem = originalSetItem
    }
  })

  it('supports synchronous custom save and read predicates with honest error reporting via onError', () => {
    const inMemoryBackend = new Map<string, ElementFingerprint>()
    const errors: string[] = []

    const storage = new MemoryStorageSystem({
      url: 'https://shop.example.com',
      save: (key, fp) => {
        if (key.includes('failing')) {
          throw new Error('Simulated disk write failure')
        }
        inMemoryBackend.set(key, fp)
      },
      read: (key) => {
        if (key.includes('failing-read')) {
          throw new Error('Simulated read corruption')
        }
        return inMemoryBackend.get(key) ?? null
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
    expect(inMemoryBackend.has('example.com:::good-item')).toBe(true)

    storage.save(fp, 'failing-item')
    expect(errors.length).toBe(1)
    expect(errors[0]).toContain('save:example.com:::failing-item:Simulated disk write failure')

    const failedRead = storage.retrieve('failing-read')
    expect(failedRead).toBeNull()
    expect(errors.length).toBe(2)
    expect(errors[1]).toContain('read:example.com:::failing-read:Simulated read corruption')
  })

  it('supports asynchronous save predicates without blocking synchronous queries and catches async rejections', async () => {
    const asyncBackend = new Map<string, ElementFingerprint>()
    const asyncErrors: string[] = []

    const storage = new MemoryStorageSystem({
      url: 'https://async.example.com',
      save: async (key, fp) => {
        await new Promise((resolve) => setTimeout(resolve, 5))
        if (key.includes('async-fail')) {
          throw new Error('Async network drop')
        }
        asyncBackend.set(key, fp)
      },
      onError: (err, ctx) => {
        const msg = err instanceof Error ? err.message : String(err)
        asyncErrors.push(`${ctx.operation}:${ctx.key ?? 'none'}:${msg}`)
      },
    })

    const fp: ElementFingerprint = {
      tag: 'span',
      attributes: { id: 'badge' },
      text: 'New',
      path: ['span'],
    }

    storage.save(fp, 'async-item')
    const syncImmediate = storage.retrieve('async-item')
    expect(syncImmediate).not.toBeNull()
    expect(syncImmediate?.text).toBe('New')

    await storage.flush()
    expect(asyncBackend.has('example.com:::async-item')).toBe(true)

    storage.save(fp, 'async-fail-item')
    await storage.flush()
    expect(asyncErrors.length).toBe(1)
    expect(asyncErrors[0]).toContain('save:example.com:::async-fail-item:Async network drop')
  })

  it('throws a descriptive runtime guard error if an unhydrated async read predicate returns a Promise during synchronous retrieve', () => {
    const asyncReadPredicate: StorageReadPredicate = async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
      return {
        tag: 'p',
        attributes: {},
        text: 'Async paragraph',
        path: ['p'],
      }
    }

    const storage = new MemoryStorageSystem({
      url: 'https://guard.example.com',
      read: asyncReadPredicate,
    })

    expect(() => {
      storage.retrieve('unhydrated-key')
    }).toThrow(/Unhydrated async read predicate detected|Call await storage\.hydrate/)
  })

  it('throws a descriptive error on unhydrated Promise from custom storage in Selector.retrieve and prevents unhandled rejections', async () => {
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
      'Storage returned an unhydrated Promise for identifier "custom-async-btn" during synchronous retrieval. Call "await storage.hydrate()" or use synchronous storage before querying.',
    )

    if (rejectPromise) {
      rejectPromise(new Error('Simulated async storage rejection'))
    }

    await new Promise((resolve) => setTimeout(resolve, 50))

    if (typeof window !== 'undefined') {
      window.removeEventListener('unhandledrejection', onUnhandled)
    }

    expect(unhandledTriggered).toBe(false)
  })

  it('enforces merge-only semantics during hydrate() so in-memory entries are never overwritten by older snapshots', async () => {
    const storage = new MemoryStorageSystem({
      url: 'https://merge.example.com',
    })

    const activeFingerprint: ElementFingerprint = {
      tag: 'button',
      attributes: { class: 'btn primary' },
      text: 'New Active Label',
      path: ['button'],
    }
    storage.save(activeFingerprint, 'checkout-btn')

    const staleSnapshot: Record<string, ElementFingerprint> = {
      'example.com:::checkout-btn': {
        tag: 'button',
        attributes: { class: 'btn old' },
        text: 'Old Stale Label',
        path: ['button'],
      },
      'example.com:::footer-link': {
        tag: 'a',
        attributes: { href: '/terms' },
        text: 'Terms of Service',
        path: ['a'],
      },
    }

    await storage.hydrate(staleSnapshot)

    const checkoutResult = storage.retrieve('checkout-btn')
    expect(checkoutResult).not.toBeNull()
    expect(checkoutResult?.text).toBe('New Active Label')
    expect(checkoutResult?.attributes.class).toBe('btn primary')

    const footerResult = storage.retrieve('footer-link')
    expect(footerResult).not.toBeNull()
    expect(footerResult?.text).toBe('Terms of Service')
  })

  it('rejects malformed fingerprints during hydration and reports them to onError', async () => {
    const reportedErrors: string[] = []
    const storage = new MemoryStorageSystem({
      url: 'https://validation.example.com',
      onError: (err, ctx) => {
        const msg = err instanceof Error ? err.message : String(err)
        reportedErrors.push(`${ctx.operation}:${ctx.key ?? 'none'}:${msg}`)
      },
    })

    const invalidSnapshot: Record<string, unknown> = {
      'example.com:::corrupt-no-tag': {
        attributes: { class: 'test' },
        path: ['div'],
      },
      'example.com:::corrupt-not-obj': 'string-not-fingerprint',
    }

    await storage.hydrate(invalidSnapshot as Record<string, ElementFingerprint>)
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

  it('bounds the global file buckets to MAX_GLOBAL_BUCKETS (100) preventing memory leaks across dynamic storageFile names', () => {
    MemoryStorageSystem.clearAll()
    const max = MemoryStorageSystem.MAX_GLOBAL_BUCKETS
    expect(max).toBe(100)

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

  it('integrates seamlessly with PagePersistenceManager across DOM mutations', async () => {
    const container = document.createElement('div')
    container.innerHTML = `
      <section class="storefront">
        <button id="add-to-cart" class="btn green" data-sku="12345">Add to Cart</button>
      </section>
    `
    document.body.appendChild(container)

    const backingStore = new Map<string, ElementFingerprint>()
    const storage = new MemoryStorageSystem({
      url: 'https://storefront.example.com/item',
      save: (key, fp) => {
        backingStore.set(key, fp)
      },
      read: (key) => {
        return backingStore.get(key) ?? null
      },
    })
    const manager = new PagePersistenceManager({
      document,
      url: 'https://storefront.example.com/item',
      storage,
      debounceMs: 10,
    })

    const initialBtn = manager.page.css('#add-to-cart', { identifier: 'add-to-cart', autoSave: true })
    expect(initialBtn.length).toBe(1)
    expect(backingStore.has('example.com:::add-to-cart')).toBe(true)

    MemoryStorageSystem.clearAll()

    container.innerHTML = `
      <div class="redesigned-storefront">
        <button class="btn green new-style" data-sku="12345">Add to Cart</button>
      </div>
    `

    const relocated = manager.page.css('#add-to-cart', { identifier: 'add-to-cart', adaptive: true })
    expect(relocated.length).toBe(1)
    expect(relocated[0].hasClass('new-style')).toBe(true)

    await manager.destroy()
    container.remove()
  })

  it('supports createScrapling and configure() with localStorage predicates', () => {
    const container = document.createElement('div')
    container.innerHTML = `
      <div class="job-card">
        <a id="apply-now-btn" class="apply-link" data-job="777">Apply Now</a>
      </div>
    `
    document.body.appendChild(container)

    const persistence = createLocalStoragePersistence({ prefix: 'easy-ls:' })
    const customScrapling = createScrapling({
      document,
      url: 'https://jobs.example.com/list',
    })
    customScrapling.configure({
      save: persistence.save,
      read: persistence.read,
      hydrate: persistence.hydrate,
      onError: persistence.onError,
    })

    const link = customScrapling('#apply-now-btn', container, 'apply-link')
    expect(link).not.toBeNull()
    expect(window.localStorage.getItem('easy-ls:example.com:::apply-link')).not.toBeNull()

    MemoryStorageSystem.clearAll()

    container.innerHTML = `
      <article class="redesigned-job-card">
        <button class="apply-link-v2" data-job="777">Apply Now</button>
      </article>
    `

    const relocated = customScrapling('#apply-now-btn', container, 'apply-link')
    expect(relocated).not.toBeNull()
    expect(relocated?.getAttribute('data-job')).toBe('777')

    container.remove()
  })

  it('keeps onRelocate subscribers across configure()', async () => {
    const container = document.createElement('div')
    container.innerHTML =
      '<div class="card"><button class="old-apply">Apply now</button></div>'
    document.body.appendChild(container)

    const scraplingInstance = createScrapling({
      document,
      url: 'https://configure.example.com',
      percentage: 20,
    })
    const events: string[] = []
    scraplingInstance.onRelocate((_old, element) => {
      events.push(element.textContent ?? '')
    })

    const button = container.querySelector('button') as HTMLElement
    scraplingInstance.remember(button, 'apply')
    scraplingInstance.configure({ percentage: 20, debounceMs: 5 })

    container.innerHTML =
      '<div class="card"><a class="new-apply" href="/apply">Apply now</a></div>'
    const restored = scraplingInstance.restore('apply', 20, container)

    expect(restored).not.toBeNull()
    expect(restored?.textContent).toBe('Apply now')
    expect(events).toEqual(['Apply now'])

    await scraplingInstance.manager.destroy()
    container.remove()
  })
})
