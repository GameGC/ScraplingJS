import type {
  CapturedElementInfo,
  ElementFingerprint,
  PagePersistenceWatcherOptions,
  RelocationCallback,
  RelocationEvent,
  StorageSystem,
} from '../types'
import { isElementVisible } from '../core/utils'
import {
  DomAdapterError,
  resolveDomAdapter,
  type DomAdapter,
} from '../core/dom-adapter'
import { isDeepConnected } from '../core/shadow-dom'
import { StorageTools } from '../core/storage-tools'
import { Selector } from '../parser/selector'
import { Selectors } from '../parser/selectors'
import { startDomWatcher } from './dom-watcher'
import { waitUntilCondition } from './dom-waiter'
import {
  detectQueryMode,
  normalizeTextQuery,
  parseQueryArguments,
  type ElementFilter,
  type ResolveQueryOptions,
  type WaitForElementOptions,
} from './query-parser'
import {
  relocateAll,
  relocateBest,
  resolveScopeRoot,
} from './relocator'

export type {
  ElementFilter,
  ResolveQueryOptions,
  WaitForElementOptions,
} from './query-parser'
export { parseQueryArguments } from './query-parser'
import {
  MemoryStorageSystem,
  type LoadAllPredicate,
  type StorageErrorHandler,
  type StorageSavePredicate,
} from '../storage'

export interface PagePersistenceManagerOptions {
  document?: Document
  dom?: DomAdapter
  url?: string
  adaptiveDomain?: string
  storage?: StorageSystem
  debounceMs?: number
  percentage?: number
  onRelocate?: RelocationCallback
  save?: StorageSavePredicate
  loadAll?: LoadAllPredicate
  onError?: StorageErrorHandler
  storageCapacity?: number
  ignoreAttributes?: readonly string[]
  pierceShadow?: boolean
}

export function resolveDocumentSource(explicit?: Document | null): Document {
  if (explicit) return explicit
  if (typeof document !== 'undefined') return document
  throw new DomAdapterError(
    'PagePersistenceManager needs a Document: pass one through the "document" option when running outside a browser.',
  )
}

export class PagePersistenceManager {
  readonly doc: Document
  readonly dom: DomAdapter
  readonly url: string
  readonly storage: StorageSystem
  readonly debounceMs: number
  readonly defaultPercentage: number
  readonly ignoreAttributes: readonly string[]
  readonly pierceShadow: boolean
  private readonly activeStoppers = new Set<() => void>()
  private readonly relocateListeners = new Set<RelocationCallback>()
  private readonly notifiedElements = new WeakMap<Element, Set<string>>()

  constructor(options?: PagePersistenceManagerOptions) {
    this.dom = resolveDomAdapter(options?.dom)
    this.doc = resolveDocumentSource(options?.document)
    this.url =
      options?.adaptiveDomain ??
      options?.url ??
      this.doc.location?.href ??
      'default'
    this.debounceMs = options?.debounceMs ?? 50
    this.defaultPercentage = options?.percentage ?? 45
    this.ignoreAttributes = options?.ignoreAttributes ?? ['href', 'src', 'id']
    this.pierceShadow = options?.pierceShadow ?? true
    this.storage =
      options?.storage ??
      new MemoryStorageSystem({
        url: this.url,
        save: options?.save,
        loadAll: options?.loadAll,
        onError: options?.onError,
        capacity: options?.storageCapacity,
      })
    if (options?.onRelocate) {
      this.relocateListeners.add(options.onRelocate)
    }
  }

  onRelocate(callback: RelocationCallback): () => void {
    this.relocateListeners.add(callback)
    return () => {
      this.relocateListeners.delete(callback)
    }
  }

  private emitRelocation(
    identifier: string,
    brokenSelector: string,
    oldFingerprint: ElementFingerprint,
    newElement: Element,
    newSelector: Selector,
    score: number,
  ): void {
    this.storage.save(newElement, identifier)

    if (this.relocateListeners.size === 0) {
      return
    }

    let seenIds = this.notifiedElements.get(newElement)
    if (!seenIds) {
      seenIds = new Set<string>()
      this.notifiedElements.set(newElement, seenIds)
    }
    if (seenIds.has(identifier)) {
      return
    }
    seenIds.add(identifier)

    const event: RelocationEvent = {
      identifier,
      brokenSelector,
      newCssSelector: newSelector.generateCssSelector,
      newFullCssSelector: newSelector.generateFullCssSelector,
      newXpathSelector: newSelector.generateXpathSelector,
      score,
      url: this.url,
      oldFingerprint,
      newElement: newElement as HTMLElement,
    }

    for (const listener of Array.from(this.relocateListeners)) {
      try {
        listener(oldFingerprint, newElement as HTMLElement, event)
      } catch {}
    }
  }

  async init(): Promise<void> {
    if (typeof this.storage.load === 'function') {
      await this.storage.load()
    }
  }

  get page(): Selector {
    return this.createRootSelector(this.doc.documentElement)
  }

  private createRootSelector(root?: Element | Document): Selector {
    const targetRoot =
      !root || root.nodeType === 9
        ? ((root as Document | undefined)?.documentElement ?? this.doc.documentElement)
        : (root as Element)
    return new Selector({
      root: targetRoot,
      url: this.url,
      pierceShadow: this.pierceShadow,
      _storage: this.storage,
      dom: this.dom,
    })
  }

  captureElement(element: Element, identifier?: string): CapturedElementInfo {
    const sel = this.createRootSelector(element)
    const cssSelector = sel.generateCssSelector
    const fullCssSelector = sel.generateFullCssSelector
    const xpathSelector = sel.generateXpathSelector
    const fullXpathSelector = sel.generateFullXpathSelector
    const effectiveId = identifier || cssSelector || fullCssSelector
    const fingerprint = StorageTools.elementToDict(element)
    this.storage.save(fingerprint, effectiveId)

    return {
      identifier: effectiveId,
      cssSelector,
      fullCssSelector,
      xpathSelector,
      fullXpathSelector,
      fingerprint,
    }
  }

  remember(element: Element, identifier?: string): string {
    return this.captureElement(element, identifier).identifier
  }

  restore(
    identifier: string,
    percentage = this.defaultPercentage,
    root?: Element | Document,
    filter?: ElementFilter<HTMLElement>,
  ): HTMLElement | null {
    const oldFingerprint = this.page.retrieve(identifier)
    if (!oldFingerprint) return null
    const res = this.relocateWithScore(oldFingerprint, percentage, root, filter)
    if (res) {
      this.emitRelocation(
        identifier,
        identifier,
        oldFingerprint,
        res.element,
        res.selector,
        res.score,
      )
    }
    return (res?.element as HTMLElement) ?? null
  }

  private querySingleDirect(
    rootSelector: Selector,
    selector: string,
    mode: 'css' | 'xpath' | 'text',
    variables?: Record<string, string | number>,
  ): Selectors {
    if (mode === 'xpath') {
      return rootSelector._queryDirect(selector, 'xpath', { variables })
    }
    if (mode === 'text') {
      const targetText = normalizeTextQuery(selector)
      return rootSelector.findByText(targetText, {
        firstMatch: false,
        partial: true,
        cleanMatch: true,
      }) as Selectors
    }
    return rootSelector._queryDirect(selector, 'css', { variables })
  }

  resolve<T extends HTMLElement = HTMLElement>(
    selectorOrSelectors: string | readonly string[],
    options?: ResolveQueryOptions<T>,
  ): Selectors {
    const queries =
      typeof selectorOrSelectors === 'string'
        ? [selectorOrSelectors]
        : selectorOrSelectors
    if (queries.length === 0) {
      return new Selectors()
    }

    const primaryQuery = queries[0]
    const identifier = options?.identifier ?? primaryQuery
    const autoSave = options?.autoSave ?? options?.auto_save ?? true
    const percentage = options?.percentage ?? this.defaultPercentage
    const filter = options?.filter
    const rootSelector = this.createRootSelector(options?.root)

    for (const q of queries) {
      const mode = detectQueryMode(q, options?.mode, this.doc, options?.variables)
      const rawMatches = this.querySingleDirect(
        rootSelector,
        q,
        mode,
        options?.variables,
      )
      const filtered = filter
        ? new Selectors(
            rawMatches.filter(
              (s) => s.rawNode && filter(s.rawNode as T),
            ),
          )
        : rawMatches

      if (filtered.length > 0) {
        if (autoSave && filtered[0].rawNode) {
          this.storage.save(filtered[0].rawNode, identifier)
        }
        return filtered
      }
    }

    const oldFingerprint = rootSelector.retrieve(identifier)
    if (!oldFingerprint) {
      return new Selectors()
    }

    if (options?.multiple) {
      const relocatedAll = this.relocateAllWithScore(
        oldFingerprint,
        percentage,
        options?.root,
        filter,
      )
      if (relocatedAll.length > 0) {
        const primary = relocatedAll[0]
        this.emitRelocation(
          identifier,
          primaryQuery,
          oldFingerprint,
          primary.element,
          primary.selector,
          primary.score,
        )
        return new Selectors(relocatedAll.map((r) => r.selector))
      }
      return new Selectors()
    }

    const relocated = this.relocateWithScore(
      oldFingerprint,
      percentage,
      options?.root,
      filter,
    )
    if (relocated) {
      this.emitRelocation(
        identifier,
        primaryQuery,
        oldFingerprint,
        relocated.element,
        relocated.selector,
        relocated.score,
      )
      return new Selectors([relocated.selector])
    }

    return new Selectors()
  }

  find<T extends HTMLElement = HTMLElement>(
    selectorOrSelectors: string | readonly string[],
    rootOrFilterOrKey?: Element | Document | ElementFilter<T> | string,
    filterOrKey?: ElementFilter<T> | string,
    key?: string,
  ): T | null {
    const parsed = parseQueryArguments<T>(
      selectorOrSelectors,
      rootOrFilterOrKey,
      filterOrKey,
      key,
    )
    const results = this.resolve<T>(selectorOrSelectors, {
      identifier: parsed.identifier,
      root: parsed.root,
      filter: parsed.filter,
      autoSave: true,
      multiple: false,
    })
    return (results[0]?.rawNode as T) ?? null
  }

  findAll<T extends HTMLElement = HTMLElement>(
    selectorOrSelectors: string | readonly string[],
    rootOrFilterOrKey?: Element | Document | ElementFilter<T> | string,
    filterOrKey?: ElementFilter<T> | string,
    key?: string,
  ): T[] {
    const parsed = parseQueryArguments<T>(
      selectorOrSelectors,
      rootOrFilterOrKey,
      filterOrKey,
      key,
    )
    const results = this.resolve<T>(selectorOrSelectors, {
      identifier: parsed.identifier,
      root: parsed.root,
      filter: parsed.filter,
      autoSave: true,
      multiple: true,
    })
    return results
      .map((s) => s.rawNode as T)
      .filter((el): el is T => Boolean(el))
  }

  relocateWithScore<T extends HTMLElement = HTMLElement>(
    identifierOrFingerprint: string | ElementFingerprint,
    percentage = this.defaultPercentage,
    root?: Element | Document,
    filter?: ElementFilter<T>,
  ): { element: Element; selector: Selector; score: number } | null {
    const fingerprint =
      typeof identifierOrFingerprint === 'string'
        ? this.page.retrieve(identifierOrFingerprint)
        : identifierOrFingerprint

    if (!fingerprint) {
      return null
    }

    const match = relocateBest<T>(
      fingerprint,
      resolveScopeRoot(root, this.doc),
      percentage,
      filter,
      this.pierceShadow,
      this.ignoreAttributes,
    )
    if (!match) {
      return null
    }
    return {
      element: match.element,
      selector: this.createRootSelector(match.element),
      score: match.score,
    }
  }

  relocateAllWithScore<T extends HTMLElement = HTMLElement>(
    identifierOrFingerprint: string | ElementFingerprint,
    percentage = this.defaultPercentage,
    root?: Element | Document,
    filter?: ElementFilter<T>,
  ): Array<{ element: Element; selector: Selector; score: number }> {
    const fingerprint =
      typeof identifierOrFingerprint === 'string'
        ? this.page.retrieve(identifierOrFingerprint)
        : identifierOrFingerprint

    if (!fingerprint) {
      return []
    }

    const matches = relocateAll<T>(
      fingerprint,
      resolveScopeRoot(root, this.doc),
      percentage,
      this.ignoreAttributes,
      filter,
      this.pierceShadow,
    )

    return matches.map((match) => ({
      element: match.element,
      selector: this.createRootSelector(match.element),
      score: match.score,
    }))
  }

  watch(
    selector: string,
    onResolved: (element: HTMLElement, relocated: boolean, score?: number) => void,
    identifier?: string,
  ): () => void {
    return this.watchElement({
      selector,
      identifier: identifier ?? selector,
      onResolved,
    })
  }

  watchElement(options: PagePersistenceWatcherOptions): () => void {
    const mode = detectQueryMode(
      options.selector,
      options.mode,
      this.doc,
      options.variables,
    )
    const identifier = options.identifier ?? options.selector
    const percentage = options.percentage ?? this.defaultPercentage
    const autoUpdate = options.autoUpdateFingerprint ?? true
    const filter = options.filter
    const variables = options.variables
    const rootSelector = this.createRootSelector(options.root)
    let currentElement: Element | null = null
    let stopped = false

    const directMatchesInScope = (): Selectors => {
      const matches = this.querySingleDirect(
        rootSelector,
        options.selector,
        mode,
        variables,
      )
      if (!filter) return matches
      return new Selectors(
        matches.filter((item) => item.rawNode && filter(item.rawNode as HTMLElement)),
      )
    }

    const evaluateNow = () => {
      // Resolve the selector once per mutation tick; the previous shape ran the
      // same query twice when the tracked element was still connected.
      const direct = directMatchesInScope()

      if (
        currentElement &&
        isDeepConnected(this.doc.documentElement, currentElement) &&
        direct.length > 0 &&
        direct[0].rawNode === currentElement
      ) {
        return
      }

      if (direct.length > 0 && direct[0].rawNode) {
        const foundEl = direct[0].rawNode
        this.storage.save(foundEl, identifier)
        // The selector works again: allow a future breakage to notify listeners
        // for this element instead of staying silent forever.
        this.notifiedElements.get(foundEl)?.delete(identifier)
        if (foundEl !== currentElement) {
          currentElement = foundEl
          options.onResolved?.(foundEl as HTMLElement, false, 100)
        }
        return
      }

      const oldFingerprint = rootSelector.retrieve(identifier)
      if (oldFingerprint) {
        const relocated = this.relocateWithScore(
          oldFingerprint,
          percentage,
          options.root,
          filter,
        )
        if (relocated) {
          if (autoUpdate) {
            this.emitRelocation(
              identifier,
              options.selector,
              oldFingerprint,
              relocated.element,
              relocated.selector,
              relocated.score,
            )
          }
          if (relocated.element !== currentElement) {
            currentElement = relocated.element
            options.onResolved?.(
              relocated.element as HTMLElement,
              true,
              relocated.score,
            )
          }
          return
        }
      }

      if (currentElement !== null) {
        this.notifiedElements.get(currentElement)?.delete(identifier)
        currentElement = null
        options.onLost?.()
      }
    }

    const stopWatcher = startDomWatcher(this.doc, this.debounceMs, evaluateNow, this.dom)

    const stop = () => {
      if (stopped) return
      stopped = true
      stopWatcher()
      this.activeStoppers.delete(stop)
    }

    this.activeStoppers.add(stop)
    return stop
  }

  isVisible(element: Element | null | undefined): boolean {
    return isElementVisible(element)
  }

  waitFor<T extends HTMLElement = HTMLElement>(
    selectorOrSelectors: string | readonly string[],
    optionsOrTimeout?: number | WaitForElementOptions<T>,
  ): Promise<T | null> {
    const opts: WaitForElementOptions<T> =
      typeof optionsOrTimeout === 'number'
        ? { timeout: optionsOrTimeout }
        : (optionsOrTimeout ?? {})
    const timeoutMs = opts.timeout ?? 10000
    const requireVisible = opts.visible ?? false
    const combinedFilter: ElementFilter<T> | undefined =
      requireVisible || opts.filter
        ? (el: T) => {
            if (requireVisible && !isElementVisible(el)) return false
            if (opts.filter && !opts.filter(el)) return false
            return true
          }
        : undefined

    return this.waitUntil<T>(() => {
      return this.find<T>(
        selectorOrSelectors,
        opts.root,
        combinedFilter,
        opts.identifier,
      )
    }, timeoutMs)
  }

  waitUntil<R>(
    condition: () => R | null | undefined | false,
    timeoutMs = 10000,
    pollMs = 200,
  ): Promise<R | null> {
    const { promise, cancel } = waitUntilCondition(
      this.doc,
      condition,
      timeoutMs,
      pollMs,
      undefined,
      this.dom,
      this.debounceMs,
    )
    this.activeStoppers.add(cancel)
    promise.then(
      () => this.activeStoppers.delete(cancel),
      () => this.activeStoppers.delete(cancel),
    )
    return promise
  }

  async destroy(): Promise<void> {
    for (const stop of Array.from(this.activeStoppers)) {
      stop()
    }
    this.activeStoppers.clear()
    this.relocateListeners.clear()
    try {
      if (typeof this.storage.flush === 'function') {
        await this.storage.flush()
      }
    } finally {
      if (typeof this.storage.close === 'function') {
        await this.storage.close()
      }
    }
  }
}
