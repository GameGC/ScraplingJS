import type { ElementFingerprint } from '../types'
import { StorageSystemMixin } from './base'

const globalBuckets = new Map<string, Map<string, ElementFingerprint>>()

export interface MemoryStorageOptions {
  storage_file?: string
  storageFile?: string
  url?: string | null
}

export class MemoryStorageSystem extends StorageSystemMixin {
  readonly storageFile: string
  private readonly bucket: Map<string, ElementFingerprint>

  constructor(optionsOrUrl?: MemoryStorageOptions | string | null, url?: string | null) {
    if (typeof optionsOrUrl === 'object' && optionsOrUrl !== null) {
      super(optionsOrUrl.url ?? url ?? null)
      this.storageFile = optionsOrUrl.storageFile ?? optionsOrUrl.storage_file ?? ':default:'
    } else {
      super(url !== undefined ? url : (optionsOrUrl ?? null))
      this.storageFile = typeof optionsOrUrl === 'string' && url !== undefined ? optionsOrUrl : ':default:'
    }

    let bucket = globalBuckets.get(this.storageFile)
    if (!bucket) {
      bucket = new Map<string, ElementFingerprint>()
      globalBuckets.set(this.storageFile, bucket)
    }
    this.bucket = bucket
  }

  private makeKey(identifier: string): string {
    return `${this.getBaseUrl()}:::${identifier}`
  }

  save(element: Element | ElementFingerprint, identifier: string): void {
    const data = this.toFingerprint(element)
    this.bucket.set(this.makeKey(identifier), structuredClone(data))
  }

  retrieve(identifier: string): ElementFingerprint | null {
    const found = this.bucket.get(this.makeKey(identifier))
    return found ? structuredClone(found) : null
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
      this.bucket.set(k, structuredClone(v))
    }
  }

  static clearAll(): void {
    globalBuckets.clear()
  }
}

export const SQLiteStorageSystem = MemoryStorageSystem
