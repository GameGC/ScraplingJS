import { describe, it, expect, beforeEach } from 'vitest'
import { LruMap, MemoryStorageSystem } from '../src/storage/memory'
import type { ElementFingerprint, StorageErrorHandler } from '../src/storage/base'

class ReferenceLruOracle<K, V> {
  readonly capacity: number
  private list: Array<{ key: K; value: V }> = []

  constructor(capacity = 1000) {
    this.capacity = capacity > 0 ? capacity : 1000
  }

  get(key: K): V | undefined {
    const idx = this.list.findIndex((item) => item.key === key)
    if (idx === -1) return undefined
    const [entry] = this.list.splice(idx, 1)
    this.list.push(entry)
    return entry.value
  }

  set(key: K, value: V): this {
    const idx = this.list.findIndex((item) => item.key === key)
    if (idx !== -1) {
      this.list.splice(idx, 1)
    } else if (this.list.length >= this.capacity) {
      this.list.shift()
    }
    this.list.push({ key, value })
    return this
  }

  has(key: K): boolean {
    return this.list.some((item) => item.key === key)
  }

  delete(key: K): boolean {
    const idx = this.list.findIndex((item) => item.key === key)
    if (idx === -1) return false
    this.list.splice(idx, 1)
    return true
  }

  clear(): void {
    this.list = []
  }

  evictOldest(): [K, V] | undefined {
    if (this.list.length === 0) return undefined
    const oldest = this.list.shift()!
    return [oldest.key, oldest.value]
  }

  get size(): number {
    return this.list.length
  }

  entries(): [K, V][] {
    return this.list.map((e) => [e.key, e.value])
  }

  keys(): K[] {
    return this.list.map((e) => e.key)
  }
}

function createSampleFingerprint(id: string, text = 'button'): ElementFingerprint {
  return {
    tag: 'button',
    attributes: { id, class: 'test-btn' },
    text,
    path: ['html', 'body', 'button'],
    depth: 3,
  }
}

describe('Milestone M2 Empirical Challenge Suite', () => {
  beforeEach(() => {
    MemoryStorageSystem.clearAll()
  })

  describe('Challenge 1: LruMap 50,000 Operations vs Independent Reference Oracle', () => {
    it('matches reference oracle eviction order and bounds over 50,000 randomized operations (capacity 25)', () => {
      const CAPACITY = 25
      const TOTAL_OPS = 50_000
      const KEY_POOL_SIZE = 100

      const lru = new LruMap<string, number>(CAPACITY)
      const oracle = new ReferenceLruOracle<string, number>(CAPACITY)

      expect(lru.capacity).toBe(CAPACITY)
      expect(oracle.capacity).toBe(CAPACITY)

      const keys = Array.from({ length: KEY_POOL_SIZE }, (_, i) => `key_${i}`)

      let getCount = 0
      let setCount = 0
      let hasCount = 0
      let deleteCount = 0
      let evictCount = 0

      const startTime = Date.now()

      for (let i = 0; i < TOTAL_OPS; i++) {
        const randKey = keys[Math.floor(Math.random() * keys.length)]
        const randVal = Math.floor(Math.random() * 1_000_000)
        const op = Math.random()

        if (op < 0.45) {
          setCount++
          lru.set(randKey, randVal)
          oracle.set(randKey, randVal)
        } else if (op < 0.75) {
          getCount++
          const lruRes = lru.get(randKey)
          const oracleRes = oracle.get(randKey)
          expect(lruRes).toBe(oracleRes)
        } else if (op < 0.85) {
          hasCount++
          const lruHas = lru.has(randKey)
          const oracleHas = oracle.has(randKey)
          expect(lruHas).toBe(oracleHas)
        } else if (op < 0.95) {
          deleteCount++
          const lruDel = lru.delete(randKey)
          const oracleDel = oracle.delete(randKey)
          expect(lruDel).toBe(oracleDel)
        } else {
          evictCount++
          const lruEvict = lru.evictOldest()
          const oracleEvict = oracle.evictOldest()
          expect(lruEvict).toEqual(oracleEvict)
        }

        expect(lru.size).toBe(oracle.size)
        expect(lru.size).toBeLessThanOrEqual(CAPACITY)

        if (i % 5000 === 0) {
          expect(Array.from(lru.entries())).toEqual(oracle.entries())
          expect(Array.from(lru.keys())).toEqual(oracle.keys())
        }
      }

      const elapsedMs = Date.now() - startTime

      expect(Array.from(lru.entries())).toEqual(oracle.entries())
      expect(Array.from(lru.keys())).toEqual(oracle.keys())
      expect(lru.size).toBeLessThanOrEqual(CAPACITY)

      expect(setCount).toBeGreaterThan(15000)
      expect(getCount).toBeGreaterThan(10000)
      expect(elapsedMs).toBeLessThan(10000)
    })

    it('verifies boundary and edge case behavior of LruMap', () => {
      const defaultLru = new LruMap<string, string>(0)
      expect(defaultLru.capacity).toBe(1000)

      const negLru = new LruMap<string, string>(-50)
      expect(negLru.capacity).toBe(1000)

      const tiny = new LruMap<string, string>(1)
      expect(tiny.evictOldest()).toBeUndefined()
      tiny.set('k1', 'v1')
      expect(tiny.size).toBe(1)
      tiny.set('k2', 'v2')
      expect(tiny.size).toBe(1)
      expect(tiny.get('k1')).toBeUndefined()
      expect(tiny.get('k2')).toBe('v2')

      tiny.set('k2', 'v2_updated')
      expect(tiny.size).toBe(1)
      expect(tiny.get('k2')).toBe('v2_updated')

      const evicted = tiny.evictOldest()
      expect(evicted).toEqual(['k2', 'v2_updated'])
      expect(tiny.size).toBe(0)
    })
  })

  describe('Challenge 2: globalBuckets Eviction Limit (100 Files)', () => {
    it('creates 200 distinct storage files and bounds globalBuckets to strictly 100 active buckets', () => {
      MemoryStorageSystem.clearAll()
      expect(MemoryStorageSystem.globalBuckets.size).toBe(0)

      const fileCount = 200
      const fp = createSampleFingerprint('global-btn')

      for (let i = 0; i < fileCount; i++) {
        const fileName = `storage_file_${i}.json`
        const storage = new MemoryStorageSystem({ storageFile: fileName })
        storage.save(fp, `item_${i}`)

        expect(MemoryStorageSystem.globalBuckets.size).toBeLessThanOrEqual(100)
      }

      expect(MemoryStorageSystem.globalBuckets.size).toBe(100)

      for (let i = 0; i < 100; i++) {
        const evictedFile = `storage_file_${i}.json`
        expect(MemoryStorageSystem.globalBuckets.has(evictedFile)).toBe(false)
      }

      for (let i = 100; i < 200; i++) {
        const retainedFile = `storage_file_${i}.json`
        expect(MemoryStorageSystem.globalBuckets.has(retainedFile)).toBe(true)
      }

      const revivedStorage = new MemoryStorageSystem({ storageFile: 'storage_file_10.json' })
      expect(revivedStorage.retrieve('item_10')).toBeNull()

      expect(MemoryStorageSystem.globalBuckets.size).toBe(100)
      expect(MemoryStorageSystem.globalBuckets.has('storage_file_10.json')).toBe(true)
      expect(MemoryStorageSystem.globalBuckets.has('storage_file_100.json')).toBe(false)
    })

    it('enforces exact LRU access promotion among globalBuckets files', () => {
      MemoryStorageSystem.clearAll()
      const fp = createSampleFingerprint('access-order-btn')

      for (let i = 0; i < 100; i++) {
        const storage = new MemoryStorageSystem({ storageFile: `f_${i}` })
        storage.save(fp, `id_${i}`)
      }
      expect(MemoryStorageSystem.globalBuckets.size).toBe(100)

      const touched = new MemoryStorageSystem({ storageFile: 'f_0' })
      expect(touched.retrieve('id_0')).not.toBeNull()

      const s100 = new MemoryStorageSystem({ storageFile: 'f_100' })
      s100.save(fp, 'id_100')

      expect(MemoryStorageSystem.globalBuckets.size).toBe(100)
      expect(MemoryStorageSystem.globalBuckets.has('f_0')).toBe(true)
      expect(MemoryStorageSystem.globalBuckets.has('f_1')).toBe(false)
    })
  })

  describe('Challenge 3: High-Concurrency (500 Async Promises) Race Immunity & Merge Integrity', () => {
    it('executes 500 concurrent async operations preserving merge-only integrity without corruption or unhandled rejections', async () => {
      const persistedDb = new Map<string, ElementFingerprint>()
      const errorLog: Array<{ message: string; op: string; key?: string }> = []

      const customOnError: StorageErrorHandler = (error, context) => {
        errorLog.push({
          message: error instanceof Error ? error.message : String(error),
          op: context.operation,
          key: context.key,
        })
      }

      const storage = new MemoryStorageSystem({
        url: 'https://concurrency.test.com',
        storageFile: 'concurrency-test.json',
        save: async (key, fp) => {
          await new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 15) + 1))
          persistedDb.set(key, fp)
        },
        read: (key) => persistedDb.get(key) ?? null,
        hydrate: async () => {
          await new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 20) + 1))
          return persistedDb
        },
        onError: customOnError,
      })

      const preservedFp = createSampleFingerprint('initial-btn', 'Active Label In-Memory')
      storage.save(preservedFp, 'critical-item')

      const promises: Promise<unknown>[] = []

      for (let i = 0; i < 150; i++) {
        const itemIndex = i % 10
        promises.push(
          (async () => {
            const fp = createSampleFingerprint(`btn-${itemIndex}`, `Dynamic Value ${i}`)
            storage.save(fp, `concurrent-item-${itemIndex}`)
          })(),
        )
      }

      for (let i = 0; i < 150; i++) {
        const itemIndex = i % 10
        promises.push(
          (async () => {
            const res = storage.retrieve(`concurrent-item-${itemIndex}`)
            if (res) {
              expect(res.tag).toBe('button')
              expect(res.attributes.id).toMatch(/^btn-/)
            }
          })(),
        )
      }

      for (let i = 0; i < 100; i++) {
        promises.push(
          (async () => {
            const snapshotBatch: Record<string, ElementFingerprint> = {
              'test.com:::critical-item': createSampleFingerprint('stale-btn', 'STALE OVERWRITE ATTEMPT'),
              [`test.com:::hydrated-batch-${i}`]: createSampleFingerprint(`batch-btn-${i}`, `Hydrated Batch ${i}`),
            }
            await storage.hydrate(snapshotBatch)
          })(),
        )
      }

      for (let i = 0; i < 100; i++) {
        promises.push(
          (async () => {
            await storage.flush()
          })(),
        )
      }

      expect(promises.length).toBe(500)

      await Promise.all(promises)
      await storage.flush()

      expect(errorLog.length).toBe(0)

      const preservedResult = storage.retrieve('critical-item')
      expect(preservedResult).not.toBeNull()
      expect(preservedResult?.text).toBe('Active Label In-Memory')
      expect(preservedResult?.attributes.id).toBe('initial-btn')

      for (let i = 0; i < 100; i++) {
        const batchKey = `hydrated-batch-${i}`
        const res = storage.retrieve(batchKey)
        expect(res).not.toBeNull()
        expect(res?.text).toBe(`Hydrated Batch ${i}`)
      }
    })

    it('preserves merge-only integrity when hydration completes after in-flight user saves', async () => {
      let resolveHydrate: (val: Record<string, ElementFingerprint>) => void = () => {}
      const hydratePromise = new Promise<Record<string, ElementFingerprint>>((resolve) => {
        resolveHydrate = resolve
      })

      const storage = new MemoryStorageSystem({
        url: 'https://race.example.com',
        hydrate: () => hydratePromise,
      })

      const hydrationExecution = storage.hydrate()

      const freshFp = createSampleFingerprint('fresh-btn', 'Freshly Saved Item')
      storage.save(freshFp, 'target-key')

      expect(storage.retrieve('target-key')?.text).toBe('Freshly Saved Item')

      resolveHydrate({
        'example.com:::target-key': createSampleFingerprint('stale-btn', 'Stale Hydrated Item'),
        'example.com:::other-key': createSampleFingerprint('other-btn', 'Other Hydrated Item'),
      })

      await hydrationExecution

      const postHydrateTarget = storage.retrieve('target-key')
      expect(postHydrateTarget).not.toBeNull()
      expect(postHydrateTarget?.text).toBe('Freshly Saved Item')
      expect(postHydrateTarget?.attributes.id).toBe('fresh-btn')

      const otherTarget = storage.retrieve('other-key')
      expect(otherTarget).not.toBeNull()
      expect(otherTarget?.text).toBe('Other Hydrated Item')
    })

    it('safely handles concurrent async write rejections without crashing flush or corrupting successful writes', async () => {
      const errorLog: string[] = []
      const storage = new MemoryStorageSystem({
        url: 'https://error-stress.test',
        save: async (key, _fp) => {
          await new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 10) + 1))
          if (key.includes('error-target')) {
            throw new Error(`Write failed on ${key}`)
          }
        },
        onError: (err, ctx) => {
          errorLog.push(`${ctx.operation}:${ctx.key}:${(err as Error).message}`)
        },
      })

      const writes: void[] = []
      for (let i = 0; i < 100; i++) {
        const isError = i % 2 === 1
        const id = isError ? `error-target-${i}` : `success-target-${i}`
        const fp = createSampleFingerprint(id, `Val ${i}`)
        writes.push(storage.save(fp, id))
      }

      await storage.flush()

      expect(errorLog.length).toBe(50)
      for (let i = 1; i < 100; i += 2) {
        expect(errorLog.some((e) => e.includes(`error-target-${i}`))).toBe(true)
      }

      for (let i = 0; i < 100; i += 2) {
        const item = storage.retrieve(`success-target-${i}`)
        expect(item).not.toBeNull()
        expect(item?.text).toBe(`Val ${i}`)
      }
    })

    it('enforces deep structured clone isolation on save, retrieve, and hydrate', async () => {
      const storage = new MemoryStorageSystem({ url: 'https://clone.example.com' })
      const originalFp = createSampleFingerprint('mut-btn', 'Original')

      storage.save(originalFp, 'clone-test')
      originalFp.attributes.id = 'MUTATED_AFTER_SAVE'
      originalFp.text = 'MUTATED_AFTER_SAVE'

      const retrieved1 = storage.retrieve('clone-test')
      expect(retrieved1?.attributes.id).toBe('mut-btn')
      expect(retrieved1?.text).toBe('Original')

      if (retrieved1) {
        retrieved1.attributes.id = 'MUTATED_AFTER_RETRIEVE'
      }
      const retrieved2 = storage.retrieve('clone-test')
      expect(retrieved2?.attributes.id).toBe('mut-btn')

      const hydrateSource: Record<string, ElementFingerprint> = {
        'example.com:::hydrate-clone': createSampleFingerprint('hyd-btn', 'Hydrated Original'),
      }
      await storage.hydrate(hydrateSource)
      hydrateSource['example.com:::hydrate-clone'].attributes.id = 'MUTATED_AFTER_HYDRATE'

      const retrievedHydrated = storage.retrieve('hydrate-clone')
      expect(retrievedHydrated?.attributes.id).toBe('hyd-btn')
    })
  })
})
