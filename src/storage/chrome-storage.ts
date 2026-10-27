import type { ElementFingerprint } from '../types'
import { StorageSystemMixin } from './base'

export interface ChromeStorageAreaLike {
  get(keys?: string | string[] | Record<string, any> | null): Promise<Record<string, any>>
  set(items: Record<string, any>): Promise<void>
  remove?(keys: string | string[]): Promise<void>
}

export interface ChromeStorageOptions {
  area?: 'local' | 'session' | 'sync' | ChromeStorageAreaLike
  prefix?: string
  url?: string | null
}

export class ChromeStorageSystem extends StorageSystemMixin {
  readonly prefix: string
  private readonly cache = new Map<string, ElementFingerprint>()
  private readonly customArea?: ChromeStorageAreaLike
  private readonly areaName: 'local' | 'session' | 'sync'
  private pendingWrites: Promise<void>[] = []

  constructor(optionsOrUrl?: ChromeStorageOptions | string | null) {
    if (typeof optionsOrUrl === 'object' && optionsOrUrl !== null) {
      super(optionsOrUrl.url ?? null)
      this.prefix = optionsOrUrl.prefix ?? 'scrapling'
      if (typeof optionsOrUrl.area === 'object' && optionsOrUrl.area !== null) {
        this.customArea = optionsOrUrl.area
        this.areaName = 'local'
      } else {
        this.areaName = optionsOrUrl.area ?? 'local'
      }
    } else {
      super(optionsOrUrl ?? null)
      this.prefix = 'scrapling'
      this.areaName = 'local'
    }
  }

  private getStorageArea(): ChromeStorageAreaLike | null {
    if (this.customArea) {
      return this.customArea
    }
    const g = globalThis as any
    if (g.chrome && g.chrome.storage && g.chrome.storage[this.areaName]) {
      return g.chrome.storage[this.areaName] as ChromeStorageAreaLike
    }
    return null
  }

  private makeKey(identifier: string): string {
    return `${this.prefix}:${this.getBaseUrl()}:${identifier}`
  }

  async hydrate(): Promise<void> {
    const area = this.getStorageArea()
    if (!area) return
    const items = await area.get(null)
    const prefixWithColon = `${this.prefix}:`
    for (const [key, value] of Object.entries(items ?? {})) {
      if (key.startsWith(prefixWithColon) && value && typeof value === 'object') {
        this.cache.set(key, value as ElementFingerprint)
      }
    }
  }

  save(element: Element | ElementFingerprint, identifier: string): void {
    const key = this.makeKey(identifier)
    const data = structuredClone(this.toFingerprint(element))
    this.cache.set(key, data)
    const area = this.getStorageArea()
    if (area) {
      const p = Promise.resolve(area.set({ [key]: data })).catch(() => {})
      this.pendingWrites.push(p)
    }
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
}
