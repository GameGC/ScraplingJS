import type { ElementFingerprint, StorageSystem } from '../types'
import { StorageTools } from '../core/storage-tools'
import { extractBaseDomain, getIdentifierHash } from '../core/utils'

export abstract class StorageSystemMixin implements StorageSystem {
  readonly url: string | null

  constructor(url?: string | null) {
    this.url = url && typeof url === 'string' ? url.toLowerCase() : null
  }

  getBaseUrl(defaultValue = 'default'): string {
    return extractBaseDomain(this.url, defaultValue)
  }

  _get_base_url(defaultValue = 'default'): string {
    return this.getBaseUrl(defaultValue)
  }

  static getHash(identifier: string): string {
    return getIdentifierHash(identifier)
  }

  static _get_hash(identifier: string): string {
    return getIdentifierHash(identifier)
  }

  protected toFingerprint(element: Element | ElementFingerprint | any): ElementFingerprint {
    if (element && typeof element === 'object' && 'rawNode' in element && element.rawNode) {
      return StorageTools.elementToDict(element.rawNode as Element)
    }
    if (typeof Element !== 'undefined' && element instanceof Element) {
      return StorageTools.elementToDict(element)
    }
    return element as ElementFingerprint
  }

  abstract save(element: Element | ElementFingerprint, identifier: string): void
  abstract retrieve(identifier: string): ElementFingerprint | null

  close(): void {}
}

export const BaseStorageSystem = StorageSystemMixin
