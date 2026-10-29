import type { ElementFingerprint } from '../types'
import {
  StorageSystemMixin,
  isValidFingerprint,
  type LoadAllPredicate,
  type StorageBucket,
  type StorageErrorHandler,
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
  /**
   * Name of the local in-memory cache bucket. It is not a user-storage
   * namespace: `save`/`loadAll` receive the exact page URL directly. Omit it
   * unless several independent local caches are needed.
   */
  storage_file?: string
  storageFile?: string
  /**
   * Exact page URL used as the storage bucket and cache namespace. When it is
   * empty, instances that use the same storage file share the `default`
   * bucket.
   */
  url?: string
  capacity?: number
  maxCapacity?: number
  /** Persists one fingerprint in the URL bucket under `key`. */
  save?: StorageSavePredicate
  /** Loads the URL bucket; `load()` uses this for preloading. */
  loadAll?: LoadAllPredicate
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
  private readonly userLoadAll?: LoadAllPredicate
  private readonly onError?: StorageErrorHandler
  private readonly pendingWrites: Promise<void>[] = []

  constructor(optionsOrUrl?: MemoryStorageOptions | string, url?: string) {
    let storageFile = ':default:'
    let resolvedUrl = ''
    let capacity = DEFAULT_BUCKET_CAPACITY
    let userSave: StorageSavePredicate | undefined
    let userLoadAll: LoadAllPredicate | undefined
    let onError: StorageErrorHandler | undefined

    if (typeof optionsOrUrl === 'object' && optionsOrUrl !== null) {
      resolvedUrl = optionsOrUrl.url ?? url ?? ''
      storageFile = optionsOrUrl.storageFile ?? optionsOrUrl.storage_file ?? ':default:'
      capacity = optionsOrUrl.capacity ?? optionsOrUrl.maxCapacity ?? DEFAULT_BUCKET_CAPACITY
      userSave = optionsOrUrl.save
      userLoadAll = optionsOrUrl.loadAll
      onError = optionsOrUrl.onError
      super(resolvedUrl)
    } else {
      resolvedUrl = url !== undefined ? url : (optionsOrUrl ?? '')
      storageFile = typeof optionsOrUrl === 'string' && url !== undefined ? optionsOrUrl : ':default:'
      super(resolvedUrl)
    }

    this.storageFile = storageFile
    this.capacity = capacity > 0 ? capacity : DEFAULT_BUCKET_CAPACITY
    this.userSave = userSave
    this.userLoadAll = userLoadAll
    this.onError = onError

    const bucketKey =
      this.capacity === 1000
        ? this.storageFile
        : `${this.storageFile}::capacity:${this.capacity}`
    let bucket = globalBuckets.get(bucketKey)
    if (!bucket || bucket.capacity !== this.capacity) {
      bucket = new LruMap<string, ElementFingerprint>(this.capacity)
      globalBuckets.set(bucketKey, bucket)
    }
    this.bucket = bucket
  }

  private keyName(identifier: string): string {
    const prefix = `${this.scope}:::`
    return identifier.startsWith(prefix) ? identifier.slice(prefix.length) : identifier
  }

  private makeKey(identifier: string): string {
    return `${this.scope}:::${this.keyName(identifier)}`
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
        const result = this.userSave(this.scope, this.keyName(identifier), structuredClone(data))
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
    const found = this.bucket.get(this.makeKey(identifier))
    return found ? structuredClone(found) : null
  }

  async load(
    input?: Record<string, ElementFingerprint> | Iterable<[string, ElementFingerprint]>,
  ): Promise<void> {
    try {
      let source: Iterable<[string, ElementFingerprint]> | undefined

      if (input) {
        if (Symbol.iterator in Object(input)) {
          source = input as Iterable<[string, ElementFingerprint]>
        } else {
          source = Object.entries(input as Record<string, ElementFingerprint>)
        }
      } else if (this.userLoadAll) {
        const loaded: unknown = await this.userLoadAll(this.scope)
        if (loaded && typeof loaded === 'object' && !Array.isArray(loaded)) {
          source = Object.entries(loaded as StorageBucket)
        } else if (loaded !== undefined) {
          const err = new Error(`loadAll("${this.scope}") must return an object of fingerprints`)
          if (this.onError) {
            this.onError(err, { operation: 'load' })
          } else {
            throw err
          }
        }
      }

      if (!source) {
        return
      }

      for (const [rawKey, value] of source) {
        const key = this.makeKey(rawKey)
        if (this.bucket.has(key)) {
          continue
        }
        if (!isValidFingerprint(value)) {
          const err = new Error(`Malformed fingerprint during loading for key "${key}"`)
          if (this.onError) {
            this.onError(err, { operation: 'load', key })
          }
          continue
        }
        this.bucket.set(key, structuredClone(value))
      }
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err))
      if (this.onError) {
        this.onError(error, { operation: 'load' })
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
    const prefix = `${this.scope}:::`
    for (const key of Array.from(this.bucket.keys())) {
      if (key.startsWith(prefix)) {
        this.bucket.delete(key)
      }
    }
  }

  exportSnapshot(): Record<string, ElementFingerprint> {
    const out: Record<string, ElementFingerprint> = {}
    for (const [k, v] of this.bucket.entries()) {
      out[k] = structuredClone(v)
    }
    return out
  }

  importSnapshot(snapshot: Record<string, ElementFingerprint>): void {
    for (const [rawKey, v] of Object.entries(snapshot)) {
      const key = this.makeKey(rawKey)
      if (isValidFingerprint(v)) {
        this.bucket.set(key, structuredClone(v))
      } else if (this.onError) {
        this.onError(new Error(`Malformed fingerprint in importSnapshot for key "${key}"`), {
          operation: 'load',
          key,
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
