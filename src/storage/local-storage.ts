import type { ElementFingerprint } from '../types'
import { StorageSystemMixin } from './base'

export interface LocalStorageOptions {
  prefix?: string
  url?: string | null
}

export class LocalStorageSystem extends StorageSystemMixin {
  readonly prefix: string
  private readonly fallback = new Map<string, string>()

  constructor(optionsOrUrl?: LocalStorageOptions | string | null) {
    if (typeof optionsOrUrl === 'object' && optionsOrUrl !== null) {
      super(optionsOrUrl.url ?? null)
      this.prefix = optionsOrUrl.prefix ?? 'scrapling'
    } else {
      super(optionsOrUrl ?? null)
      this.prefix = 'scrapling'
    }
  }

  private getKey(identifier: string): string {
    return `${this.prefix}:${this.getBaseUrl()}:${identifier}`
  }

  private getStorage(): Storage | null {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage
      }
    } catch {
      return null
    }
    return null
  }

  save(element: Element | ElementFingerprint, identifier: string): void {
    const key = this.getKey(identifier)
    const serialized = JSON.stringify(this.toFingerprint(element))
    const storage = this.getStorage()
    if (storage) {
      storage.setItem(key, serialized)
    } else {
      this.fallback.set(key, serialized)
    }
  }

  retrieve(identifier: string): ElementFingerprint | null {
    const key = this.getKey(identifier)
    const storage = this.getStorage()
    const raw = storage ? storage.getItem(key) : (this.fallback.get(key) ?? null)
    if (!raw) {
      return null
    }
    try {
      return JSON.parse(raw) as ElementFingerprint
    } catch {
      return null
    }
  }

  remove(identifier: string): void {
    const key = this.getKey(identifier)
    const storage = this.getStorage()
    if (storage) {
      storage.removeItem(key)
    } else {
      this.fallback.delete(key)
    }
  }
}
