import type { StorageSystem } from '../types'

export type StorageConstructor = new (
  options?: Record<string, unknown>,
) => StorageSystem

export interface StorageConfiguration {
  storage: StorageSystem | StorageConstructor
  storageArgs?: Record<string, unknown>
}

let configuration: StorageConfiguration | undefined

/**
 * Configures the storage used by every Selector created after this call.
 *
 * Pass a constructor to create one storage instance per Selector with the
 * selector URL injected into its options, or pass a ready instance to share a
 * single store. A per-Selector constructor is the usual choice for browser
 * extensions, where each page has its own bucket.
 *
 * When the constructor is `MemoryStorageSystem`, persistence is two plain
 * functions:
 *
 * ```ts
 * configureStorage(MemoryStorageSystem, {
 *   save: async (url, key, fingerprint) => backend.set(url, key, fingerprint),
 *   loadAll: async (url) => backend.getBucket(url), // { [key]: fingerprint }
 * })
 * ```
 *
 * `url` is the exact page URL; `key` is the selector identifier without any
 * domain prefix. `loadAll` runs once before queries, so async backends can
 * preload the whole page bucket without the library guessing keys.
 *
 * `storage_file` is only the name of the local in-memory cache bucket; it is
 * not sent to the backend. Omit it unless separate local caches are needed.
 */
export function configureStorage(
  storage: StorageSystem | StorageConstructor,
  storageArgs?: Record<string, unknown>,
): void {
  configuration = { storage, storageArgs }
}

/** Returns the current one-time storage configuration, if any. */
export function getStorageConfiguration(): StorageConfiguration | undefined {
  return configuration
}

/** Clears the global configuration. Primarily useful in tests. */
export function resetStorageConfiguration(): void {
  configuration = undefined
}
