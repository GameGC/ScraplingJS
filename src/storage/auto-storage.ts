import type { ElementFingerprint } from '../types'
import { StorageSystemMixin } from './base'
import { ChromeStorageSystem } from './chrome-storage'
import { LocalStorageSystem } from './local-storage'
import { MemoryStorageSystem } from './memory'

export interface AutoStorageOptions {
  storage_file?: string
  storageFile?: string
  prefix?: string
  url?: string | null
}

export class AutoStorageSystem extends StorageSystemMixin {
  private readonly memory: MemoryStorageSystem
  private readonly local: LocalStorageSystem
  private readonly chrome: ChromeStorageSystem

  constructor(optionsOrUrl?: AutoStorageOptions | string | null, url?: string | null) {
    const resolvedUrl =
      typeof optionsOrUrl === 'object' && optionsOrUrl !== null
        ? (optionsOrUrl.url ?? url ?? null)
        : (url !== undefined ? url : (optionsOrUrl ?? null))

    super(resolvedUrl)

    const storageFile =
      typeof optionsOrUrl === 'object' && optionsOrUrl !== null
        ? (optionsOrUrl.storageFile ?? optionsOrUrl.storage_file ?? ':default:')
        : typeof optionsOrUrl === 'string' && url !== undefined
          ? optionsOrUrl
          : ':default:'

    const prefix =
      typeof optionsOrUrl === 'object' && optionsOrUrl !== null
        ? (optionsOrUrl.prefix ?? 'scrapling')
        : 'scrapling'

    this.memory = new MemoryStorageSystem({ storageFile, url: this.url })
    this.local = new LocalStorageSystem({ prefix, url: this.url })
    this.chrome = new ChromeStorageSystem({ prefix, url: this.url })
    void this.chrome.hydrate()
  }

  save(element: Element | ElementFingerprint, identifier: string): void {
    const fp = this.toFingerprint(element)
    this.memory.save(fp, identifier)
    this.local.save(fp, identifier)
    this.chrome.save(fp, identifier)
  }

  retrieve(identifier: string): ElementFingerprint | null {
    const fromMem = this.memory.retrieve(identifier)
    if (fromMem) {
      return fromMem
    }
    const fromChrome = this.chrome.retrieve(identifier)
    if (fromChrome) {
      this.memory.save(fromChrome, identifier)
      return fromChrome
    }
    const fromLocal = this.local.retrieve(identifier)
    if (fromLocal) {
      this.memory.save(fromLocal, identifier)
      return fromLocal
    }
    return null
  }

  clear(): void {
    this.memory.clear()
  }
}
