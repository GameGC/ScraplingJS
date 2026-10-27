import type { ElementFingerprint } from '../types'
import {
  StorageSystemMixin,
  isValidFingerprint,
  type StorageErrorHandler,
  type StorageHydrateSource,
  type StorageReadPredicate,
  type StorageSavePredicate,
} from './base'

export class LruMap<K, V> {
  readonly capacity: number
  private readonly map = new Map<K, V>()

  constructor(capacity = 1000) {
    this.capacity = capacity > 0 ? capacity : 1000
  }

  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined
    const val = this.map.get(key) as V
    this.map.delete(key)
    this.map.set(key, val)
    return val
  }

  set(key: K, value: V): this {
    if (this.map.has(key)) {
      this.map.delete(key)
    } else if (this.map.size >= this.capacity) {
      this.evictOldest()
    }
    this.map.set(key, value)
    return this
  }

  has(key: K): boolean {
    return this.map.has(key)
  }

  delete(key: K): boolean {
    return this.map.delete(key)
  }

  clear(): void {
    this.map.clear()
  }

  evictOldest(): [K, V] | undefined {
    const next = this.map.keys().next()
    if (next.done) return undefined
    const oldestKey = next.value as K
    const val = this.map.get(oldestKey) as V
    this.map.delete(oldestKey)
    return [oldestKey, val]
  }

  get size(): number {
    return this.map.size
  }

  entries(): IterableIterator<[K, V]> {
    return this.map.entries()
  }

  keys(): IterableIterator<K> {
    return this.map.keys()
  }

  values(): IterableIterator<V> {
    return this.map.values()
  }

  [Symbol.iterator](): IterableIterator<[K, V]> {
    return this.map.entries()
  }
}

const MAX_GLOBAL_BUCKETS = 100
const DEFAULT_BUCKET_CAPACITY = 1000
const globalBuckets = new LruMap<string, LruMap<string, ElementFingerprint>>(MAX_GLOBAL_BUCKETS)

export interface MemoryStorageOptions {
  storage_file?: string
  storageFile?: string
  url?: string | null
  capacity?: number
  maxCapacity?: number
  save?: StorageSavePredicate
  read?: StorageReadPredicate
  hydrate?: StorageHydrateSource
  onError?: StorageErrorHandler
}

export class MemoryStorageSystem extends StorageSystemMixin {
  static readonly globalBuckets = globalBuckets
  static readonly MAX_GLOBAL_BUCKETS = MAX_GLOBAL_BUCKETS
  static readonly DEFAULT_BUCKET_CAPACITY = DEFAULT_BUCKET_CAPACITY

  readonly storageFile: string
  readonly capacity: number
  private readonly bucket: LruMap<string, ElementFingerprint>
  private readonly userSave?: StorageSavePredicate
  private readonly userRead?: StorageReadPredicate
  private readonly userHydrate?: StorageHydrateSource
  private readonly onError?: StorageErrorHandler
  private readonly pendingWrites: Promise<void>[] = []

  constructor(optionsOrUrl?: MemoryStorageOptions | string | null, url?: string | null) {
    let storageFile = ':default:'
    let resolvedUrl: string | null = null
    let capacity = DEFAULT_BUCKET_CAPACITY
    let userSave: StorageSavePredicate | undefined
    let userRead: StorageReadPredicate | undefined
    let userHydrate: StorageHydrateSource | undefined
    let onError: StorageErrorHandler | undefined

    if (typeof optionsOrUrl === 'object' && optionsOrUrl !== null) {
      resolvedUrl = optionsOrUrl.url ?? url ?? null
      storageFile = optionsOrUrl.storageFile ?? optionsOrUrl.storage_file ?? ':default:'
      capacity = optionsOrUrl.capacity ?? optionsOrUrl.maxCapacity ?? DEFAULT_BUCKET_CAPACITY
      userSave = optionsOrUrl.save
      userRead = optionsOrUrl.read
      userHydrate = optionsOrUrl.hydrate
      onError = optionsOrUrl.onError
      super(resolvedUrl)
    } else {
      resolvedUrl = url !== undefined ? url : (optionsOrUrl ?? null)
      storageFile = typeof optionsOrUrl === 'string' && url !== undefined ? optionsOrUrl : ':default:'
      super(resolvedUrl)
    }

    this.storageFile = storageFile
    this.capacity = capacity > 0 ? capacity : DEFAULT_BUCKET_CAPACITY
    this.userSave = userSave
    this.userRead = userRead
    this.userHydrate = userHydrate
    this.onError = onError

    let bucket = globalBuckets.get(this.storageFile)
    if (!bucket) {
      bucket = new LruMap<string, ElementFingerprint>(this.capacity)
      globalBuckets.set(this.storageFile, bucket)
    }
    this.bucket = bucket
  }

  private makeKey(identifier: string): string {
    const prefix = `${this.getBaseUrl()}:::`
    if (identifier.startsWith(prefix)) {
      return identifier
    }
    return `${prefix}${identifier}`
  }

  save(
    elementOrIdentifier: Element | ElementFingerprint | string,
    identifierOrData?: string | ElementFingerprint | Element,
  ): void | Promise<void> {
    let identifier: string
    let rawElement: Element | ElementFingerprint
    if (typeof elementOrIdentifier === 'string') {
      identifier = elementOrIdentifier
      rawElement = identifierOrData as Element | ElementFingerprint
    } else {
      identifier = typeof identifierOrData === 'string' ? identifierOrData : String(identifierOrData ?? '')
      rawElement = elementOrIdentifier
    }

    const data = this.toFingerprint(rawElement)
    const key = this.makeKey(identifier)
    this.bucket.set(key, structuredClone(data))

    if (this.userSave) {
      try {
        const result = this.userSave(key, data)
        if (result && typeof (result as Promise<void>).then === 'function') {
          const promise = (result as Promise<void>).catch((err: unknown) => {
            const error = err instanceof Error ? err : new Error(String(err))
            if (this.onError) {
              this.onError(error, { operation: 'save', key })
            }
          })
          this.pendingWrites.push(promise)
          promise.finally(() => {
            const idx = this.pendingWrites.indexOf(promise)
            if (idx !== -1) {
              this.pendingWrites.splice(idx, 1)
            }
          })
        }
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err))
        if (this.onError) {
          this.onError(error, { operation: 'save', key })
        } else {
          throw error
        }
      }
    }
  }

  retrieve(identifier: string): ElementFingerprint | null {
    const key = this.makeKey(identifier)
    const found = this.bucket.get(key)
    if (found) {
      return structuredClone(found)
    }

    if (this.userRead) {
      let result: ElementFingerprint | null | Promise<ElementFingerprint | null>
      try {
        result = this.userRead(key)
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err))
        if (this.onError) {
          this.onError(error, { operation: 'read', key })
          return null
        }
        throw error
      }

      if (result && typeof (result as Promise<unknown>).then === 'function') {
        if (typeof (result as Promise<unknown>).catch === 'function') {
          (result as Promise<unknown>).catch(() => {})
        }
        throw new Error(
          `Async read predicate returned a Promise for key "${key}" during synchronous retrieve(). Unhydrated async read predicate detected on synchronous retrieval. Call "await storage.hydrate()" or await storage.hydrate() before querying.`,
        )
      }

      if (result) {
        if (isValidFingerprint(result)) {
          this.bucket.set(key, structuredClone(result))
          return structuredClone(result)
        }
        const err = new Error(`Malformed fingerprint returned from read predicate for key "${key}"`)
        if (this.onError) {
          this.onError(err, { operation: 'read', key })
        }
        return null
      }
    }

    return null
  }

  async hydrate(
    entries?: Record<string, ElementFingerprint> | Iterable<[string, ElementFingerprint]> | null,
  ): Promise<void> {
    try {
      let source: Iterable<[string, ElementFingerprint]> | null = null

      if (entries) {
        if (Symbol.iterator in Object(entries)) {
          source = entries as Iterable<[string, ElementFingerprint]>
        } else {
          source = Object.entries(entries as Record<string, ElementFingerprint>)
        }
      } else if (this.userHydrate) {
        const loaded = await this.userHydrate()
        if (loaded) {
          if (Symbol.iterator in Object(loaded)) {
            source = loaded as Iterable<[string, ElementFingerprint]>
          } else {
            source = Object.entries(loaded as Record<string, ElementFingerprint>)
          }
        }
      }

      if (!source) {
        return
      }

      for (const [key, value] of source) {
        if (this.bucket.has(key)) {
          continue
        }
        if (!isValidFingerprint(value)) {
          const err = new Error(`Malformed fingerprint during hydration for key "${key}"`)
          if (this.onError) {
            this.onError(err, { operation: 'hydrate', key })
          }
          continue
        }
        this.bucket.set(key, structuredClone(value))
      }
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err))
      if (this.onError) {
        this.onError(error, { operation: 'hydrate' })
      } else {
        throw error
      }
    }
  }

  async flush(): Promise<void> {
    if (this.pendingWrites.length > 0) {
      await Promise.all(this.pendingWrites)
    }
  }

  delete(identifier: string): void {
    const key = this.makeKey(identifier)
    this.bucket.delete(key)
  }

  remove(identifier: string): void {
    this.delete(identifier)
  }

  override async close(): Promise<void> {
    await this.flush()
  }

  clear(): void {
    this.bucket.clear()
  }

  exportSnapshot(): Record<string, ElementFingerprint> {
    const out: Record<string, ElementFingerprint> = {}
    for (const [k, v] of this.bucket.entries()) {
      out[k] = structuredClone(v)
    }
    return out
  }

  importSnapshot(snapshot: Record<string, ElementFingerprint>): void {
    for (const [k, v] of Object.entries(snapshot)) {
      if (isValidFingerprint(v)) {
        this.bucket.set(k, structuredClone(v))
      } else if (this.onError) {
        this.onError(new Error(`Malformed fingerprint in importSnapshot for key "${k}"`), {
          operation: 'hydrate',
          key: k,
        })
      }
    }
  }

  static clearAll(): void {
    globalBuckets.clear()
  }
}

export const AutoStorageSystem = MemoryStorageSystem
export type AutoStorageSystem = MemoryStorageSystem
