import type { ElementFingerprint } from '../types'
import { StorageSystemMixin } from './base'

export interface IndexedDBStorageOptions {
  dbName?: string
  storeName?: string
  url?: string | null
}

export class IndexedDBStorageSystem extends StorageSystemMixin {
  readonly dbName: string
  readonly storeName: string
  private readonly cache = new Map<string, ElementFingerprint>()
  private dbPromise: Promise<IDBDatabase | null> | null = null
  private pendingWrites: Promise<void>[] = []

  constructor(optionsOrUrl?: IndexedDBStorageOptions | string | null) {
    if (typeof optionsOrUrl === 'object' && optionsOrUrl !== null) {
      super(optionsOrUrl.url ?? null)
      this.dbName = optionsOrUrl.dbName ?? 'scrapling_db'
      this.storeName = optionsOrUrl.storeName ?? 'elements_storage'
    } else {
      super(optionsOrUrl ?? null)
      this.dbName = 'scrapling_db'
      this.storeName = 'elements_storage'
    }
  }

  private makeKey(identifier: string): string {
    return `${this.getBaseUrl()}:::${identifier}`
  }

  private openDB(): Promise<IDBDatabase | null> {
    if (this.dbPromise) {
      return this.dbPromise
    }
    if (typeof indexedDB === 'undefined') {
      this.dbPromise = Promise.resolve(null)
      return this.dbPromise
    }
    this.dbPromise = new Promise((resolve) => {
      const request = indexedDB.open(this.dbName, 1)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName)
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
    })
    return this.dbPromise
  }

  async hydrate(): Promise<void> {
    const db = await this.openDB()
    if (!db) return
    await new Promise<void>((resolve) => {
      const tx = db.transaction(this.storeName, 'readonly')
      const store = tx.objectStore(this.storeName)
      const cursorReq = store.openCursor()
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result
        if (cursor) {
          if (typeof cursor.key === 'string' && cursor.value) {
            this.cache.set(cursor.key, cursor.value as ElementFingerprint)
          }
          cursor.continue()
        } else {
          resolve()
        }
      }
      cursorReq.onerror = () => resolve()
    })
  }

  save(element: Element | ElementFingerprint, identifier: string): void {
    const key = this.makeKey(identifier)
    const data = structuredClone(this.toFingerprint(element))
    this.cache.set(key, data)
    const writeOp = this.openDB().then(async (db) => {
      if (!db) return
      await new Promise<void>((resolve) => {
        const tx = db.transaction(this.storeName, 'readwrite')
        const store = tx.objectStore(this.storeName)
        store.put(data, key)
        tx.oncomplete = () => resolve()
        tx.onerror = () => resolve()
      })
    })
    this.pendingWrites.push(writeOp)
  }

  retrieve(identifier: string): ElementFingerprint | null {
    const key = this.makeKey(identifier)
    const found = this.cache.get(key)
    return found ? structuredClone(found) : null
  }

  async flush(): Promise<void> {
    const pending = this.pendingWrites.splice(0, this.pendingWrites.length)
    await Promise.all(pending)
  }

  override async close(): Promise<void> {
    await this.flush()
    if (this.dbPromise) {
      const db = await this.dbPromise
      db?.close()
      this.dbPromise = null
    }
  }
}
