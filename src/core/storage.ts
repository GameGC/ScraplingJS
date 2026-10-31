import type { ElementFingerprint, RelocatedCallback, RelocationInfo, SimpleStorage } from '../types'

const DEFAULT_CAPACITY = 1000
const MAX_BUCKETS = 100

/**
 * Bounded Least-Recently-Used (LRU) map that evicts the oldest entry once `capacity` is reached.
 * Used internally to cap memory at 100 URL scopes × 1,000 fingerprints per scope.
 */
export class LruMap<K, V> {
  readonly capacity: number
  private readonly map = new Map<K, V>()

  constructor(capacity = DEFAULT_CAPACITY) {
    this.capacity = capacity > 0 ? capacity : DEFAULT_CAPACITY
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
      const oldest = this.map.keys().next()
      if (!oldest.done) {
        this.map.delete(oldest.value)
      }
    }
    this.map.set(key, value)
    return this
  }

  has(key: K): boolean {
    return this.map.has(key)
  }

  clear(): void {
    this.map.clear()
  }
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.values(value).every((v) => typeof v === 'string')
}

/**
 * Type guard that checks whether an unknown JSON object is a valid `ElementFingerprint`
 * (non-empty `tag`, string `attributes` map, and non-empty `path` array).
 */
export function isValidFingerprint(fp: unknown): fp is ElementFingerprint {
  if (!fp || typeof fp !== 'object' || Array.isArray(fp)) return false
  const c = fp as Record<string, unknown>
  if (typeof c.tag !== 'string' || !c.tag.trim()) return false
  if (!isStringRecord(c.attributes)) return false
  return (
    Array.isArray(c.path) &&
    c.path.length > 0 &&
    c.path.every((p) => typeof p === 'string' && p.trim().length > 0)
  )
}

const buckets = new LruMap<string, LruMap<string, ElementFingerprint>>(MAX_BUCKETS)
let activeAdapter: SimpleStorage | null = null
let relocatedListener: RelocatedCallback | null = null

/**
 * Registers a persistent storage backend (`{ loadAll(url), save(url, key, fingerprint) }`).
 * Call once at startup to persist adaptive fingerprints to disk, database, or `localStorage`.
 */
export function setStorage(storage: SimpleStorage): void {
  activeAdapter = storage
}

/**
 * Clears all in-memory LRU fingerprint buckets and detaches any custom storage adapter.
 */
export function resetStorage(): void {
  activeAdapter = null
  buckets.clear()
}

/**
 * Subscribes to adaptive relocation analytics (`(foundSuccessfully, info) => void`).
 * Fires whenever a selector misses in the DOM (0 direct hits) and relocation runs.
 * Returns an unsubscribe function.
 */
export function onRelocated(callback: RelocatedCallback | null): () => void {
  relocatedListener = callback
  return () => {
    if (relocatedListener === callback) {
      relocatedListener = null
    }
  }
}

export function emitRelocated(
  info: RelocationInfo,
  scopedCallback?: RelocatedCallback,
): void {
  try {
    scopedCallback?.(info.foundSuccessfully, info)
  } catch {}
  try {
    relocatedListener?.(info.foundSuccessfully, info)
  } catch {}
}

function getBucket(scope: string): LruMap<string, ElementFingerprint> {
  let bucket = buckets.get(scope)
  if (!bucket) {
    bucket = new LruMap<string, ElementFingerprint>(DEFAULT_CAPACITY)
    buckets.set(scope, bucket)
  }
  return bucket
}

export async function loadScopeStorage(url: string): Promise<void> {
  if (!activeAdapter) return
  const scope = url.trim() || 'default'
  const bucket = getBucket(scope)
  const loaded = await activeAdapter.loadAll(scope)
  if (!loaded || typeof loaded !== 'object' || Array.isArray(loaded)) return
  for (const [key, fp] of Object.entries(loaded)) {
    if (!bucket.has(key) && isValidFingerprint(fp)) {
      bucket.set(key, structuredClone(fp))
    }
  }
}

/**
 * Saves an `ElementFingerprint` under `(url, key)` in the in-memory LRU cache and forwards it to `setStorage`.
 */
export function saveFingerprint(
  url: string,
  key: string,
  fingerprint: ElementFingerprint,
): void {
  const scope = url.trim() || 'default'
  const copy = structuredClone(fingerprint)
  getBucket(scope).set(key, copy)
  if (activeAdapter) {
    try {
      const res = activeAdapter.save(scope, key, structuredClone(copy))
      if (res && typeof (res as Promise<void>).catch === 'function') {
        ;(res as Promise<void>).catch(() => {})
      }
    } catch {}
  }
}

/**
 * Reads a cloned `ElementFingerprint` for `(url, key)` from the in-memory LRU cache, or `null` if missing.
 */
export function getFingerprint(
  url: string,
  key: string,
): ElementFingerprint | null {
  const scope = url.trim() || 'default'
  const found = getBucket(scope).get(key)
  return found ? structuredClone(found) : null
}
