import type { BoundingRectInfo, ElementFingerprint, StorageSystem } from '../types'
import { StorageTools } from '../core/storage-tools'
import { extractBaseDomain, getIdentifierHash } from '../core/utils'

export type AdaptiveFingerprint = ElementFingerprint

export type SavePredicate = (key: string, fingerprint: ElementFingerprint) => void | Promise<void>
export type ReadPredicate = (key: string) => ElementFingerprint | null | Promise<ElementFingerprint | null>
export type ErrorHandler = (error: unknown, context: { operation: 'save' | 'read' | 'hydrate'; key?: string }) => void

export type StorageSavePredicate = SavePredicate
export type StorageReadPredicate = ReadPredicate
export type StorageErrorHandler = ErrorHandler
export type StorageHydrateSource = () => Promise<
  Record<string, ElementFingerprint> | Iterable<[string, ElementFingerprint]>
>

export function isValidFingerprint(fp: unknown): fp is ElementFingerprint {
  if (typeof fp !== 'object' || fp === null || Array.isArray(fp)) {
    return false
  }
  const candidate = fp as Record<string, unknown>
  if (typeof candidate.tag !== 'string' || candidate.tag.trim() === '') {
    return false
  }
  if (
    typeof candidate.attributes !== 'object' ||
    candidate.attributes === null ||
    Array.isArray(candidate.attributes)
  ) {
    return false
  }
  for (const val of Object.values(candidate.attributes)) {
    if (typeof val !== 'string') {
      return false
    }
  }
  const isStringPath =
    typeof candidate.path === 'string' &&
    (candidate.path.includes('>') || candidate.path.includes('/')) &&
    candidate.path.trim().length > 0
  const isArrayPath =
    Array.isArray(candidate.path) &&
    candidate.path.length > 0 &&
    candidate.path.every((p) => typeof p === 'string' && p.trim().length > 0)
  if (!isStringPath && !isArrayPath) {
    return false
  }
  if (candidate.text !== undefined && candidate.text !== null && typeof candidate.text !== 'string') {
    return false
  }
  if (candidate.all_text !== undefined && candidate.all_text !== null && typeof candidate.all_text !== 'string') {
    return false
  }
  if (candidate.parent_name !== undefined && typeof candidate.parent_name !== 'string') {
    return false
  }
  if (candidate.parent_attribs !== undefined) {
    if (
      typeof candidate.parent_attribs !== 'object' ||
      candidate.parent_attribs === null ||
      Array.isArray(candidate.parent_attribs)
    ) {
      return false
    }
    for (const val of Object.values(candidate.parent_attribs)) {
      if (typeof val !== 'string') {
        return false
      }
    }
  }
  if (candidate.parent_text !== undefined && candidate.parent_text !== null && typeof candidate.parent_text !== 'string') {
    return false
  }
  if (candidate.semantic_attrs !== undefined) {
    if (
      typeof candidate.semantic_attrs !== 'object' ||
      candidate.semantic_attrs === null ||
      Array.isArray(candidate.semantic_attrs)
    ) {
      return false
    }
    for (const val of Object.values(candidate.semantic_attrs)) {
      if (typeof val !== 'string') {
        return false
      }
    }
  }
  if (candidate.stable_classes !== undefined) {
    if (
      !Array.isArray(candidate.stable_classes) ||
      !candidate.stable_classes.every((c) => typeof c === 'string')
    ) {
      return false
    }
  }
  if (candidate.siblings !== undefined && !Array.isArray(candidate.siblings)) {
    return false
  }
  if (candidate.children !== undefined && !Array.isArray(candidate.children)) {
    return false
  }
  if (candidate.depth !== undefined && (typeof candidate.depth !== 'number' || Number.isNaN(candidate.depth))) {
    return false
  }
  if (candidate.sibling_index !== undefined && (typeof candidate.sibling_index !== 'number' || Number.isNaN(candidate.sibling_index))) {
    return false
  }
  if (
    candidate.rect !== undefined &&
    candidate.rect !== null &&
    (typeof candidate.rect !== 'object' ||
      Array.isArray(candidate.rect) ||
      typeof (candidate.rect as BoundingRectInfo).x !== 'number' ||
      Number.isNaN((candidate.rect as BoundingRectInfo).x) ||
      typeof (candidate.rect as BoundingRectInfo).y !== 'number' ||
      Number.isNaN((candidate.rect as BoundingRectInfo).y) ||
      typeof (candidate.rect as BoundingRectInfo).width !== 'number' ||
      Number.isNaN((candidate.rect as BoundingRectInfo).width) ||
      typeof (candidate.rect as BoundingRectInfo).height !== 'number' ||
      Number.isNaN((candidate.rect as BoundingRectInfo).height))
  ) {
    return false
  }
  return true
}

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

  protected toFingerprint(
    element: Element | ElementFingerprint | { rawNode?: Element | null } | unknown,
  ): ElementFingerprint {
    if (typeof element === 'object' && element !== null && 'rawNode' in element) {
      const raw = (element as { rawNode?: Element | null }).rawNode
      if (raw && typeof Element !== 'undefined' && raw instanceof Element) {
        return StorageTools.elementToDict(raw)
      }
    }
    if (typeof Element !== 'undefined' && element instanceof Element) {
      return StorageTools.elementToDict(element)
    }
    return element as ElementFingerprint
  }

  abstract save(
    elementOrIdentifier: Element | ElementFingerprint | string,
    identifierOrData?: string | ElementFingerprint | Element,
  ): void | Promise<void>

  abstract retrieve(identifier: string): ElementFingerprint | null | Promise<ElementFingerprint | null>

  close(): void {}
}

export const BaseStorageSystem = StorageSystemMixin
