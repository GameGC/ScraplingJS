import type {
  AdaptiveQueryOptions,
  CapturedElementInfo,
  ElementFingerprint,
  PagePersistenceWatcherOptions,
  RelocationCallback,
  RelocationEvent,
  StorageSystem,
} from '../types'
import { areElementsAlike, calculateSimilarityScore } from '../core/similarity'
import { StorageTools } from '../core/storage-tools'
import { Selector } from '../parser/selector'
import { Selectors } from '../parser/selectors'
import {
  collectDeepElements,
  collectDeepShadowRoots,
  isDeepConnected,
} from '../snapshot/shadow-dom'
import { AutoStorageSystem } from '../storage'

export interface PagePersistenceManagerOptions {
  document?: Document
  url?: string
  adaptiveDomain?: string
  storage?: StorageSystem
  debounceMs?: number
  percentage?: number
  onRelocate?: RelocationCallback
}

export type ElementFilter<T extends HTMLElement = HTMLElement> = (
  element: T,
) => boolean

export interface ResolveQueryOptions<T extends HTMLElement = HTMLElement>
  extends AdaptiveQueryOptions {
  mode?: 'auto' | 'css' | 'xpath' | 'text'
  root?: Element | Document
  multiple?: boolean
  filter?: ElementFilter<T>
}

export interface WaitForElementOptions<T extends HTMLElement = HTMLElement> {
  timeout?: number
  visible?: boolean
  root?: Element | Document
  filter?: ElementFilter<T>
  identifier?: string
}

export function isElementVisible(element: Element | null | undefined): boolean {
  if (!element) return false
  if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
    const style = window.getComputedStyle(element)
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.visibility === 'collapse' ||
      style.opacity === '0'
    ) {
      return false
    }
  }
  const rect = element.getBoundingClientRect()
  if (rect.width > 0 && rect.height > 0) {
    return true
  }
  const htmlEl = element as HTMLElement
  if (htmlEl.offsetWidth > 0 && htmlEl.offsetHeight > 0) {
    return true
  }
  return element.getClientRects().length > 0
}

function detectQueryMode(
  query: string,
  explicitMode?: 'auto' | 'css' | 'xpath' | 'text',
): 'css' | 'xpath' | 'text' {
  if (explicitMode && explicitMode !== 'auto') {
    return explicitMode
  }
  const trimmed = query.trim()
  if (trimmed.startsWith('/') || trimmed.startsWith('(')) {
    return 'xpath'
  }
  if (trimmed.startsWith('text=') || trimmed.startsWith('text:')) {
    return 'text'
  }
  try {
    document.createDocumentFragment().querySelector(trimmed)
    return 'css'
  } catch {
    return 'text'
  }
}

function normalizeTextQuery(query: string): string {
  const trimmed = query.trim()
  if (trimmed.startsWith('text=') || trimmed.startsWith('text:')) {
    return trimmed.slice(5).trim()
  }
  return trimmed
}

export class PagePersistenceManager {
  readonly doc: Document
  readonly url: string
  readonly storage: StorageSystem
  readonly debounceMs: number
  readonly defaultPercentage: number
  private readonly activeStoppers = new Set<() => void>()
  private readonly relocateListeners = new Set<RelocationCallback>()
  private readonly notifiedElements = new WeakMap<Element, Set<string>>()

  constructor(options?: PagePersistenceManagerOptions) {
    this.doc = options?.document ?? document
    this.url =
      options?.adaptiveDomain ??
      options?.url ??
      this.doc.location?.href ??
      'default'
    this.debounceMs = options?.debounceMs ?? 50
    this.defaultPercentage = options?.percentage ?? 45
    this.storage = options?.storage ?? new AutoStorageSystem({ url: this.url })
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
    const s = this.storage as any
    if (typeof s.hydrate === 'function') {
      await s.hydrate()
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
      adaptive: true,
      pierceShadow: true,
      _storage: this.storage,
    })
  }

  captureElement(element: Element, identifier?: string): CapturedElementInfo {
    const sel = new Selector({
      root: element,
      url: this.url,
      adaptive: true,
      pierceShadow: true,
      _storage: this.storage,
    })
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
    filter?: ElementFilter<any>,
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
    identifier: string,
    variables?: Record<string, string | number | boolean>,
  ): Selectors {
    if (mode === 'xpath') {
      return rootSelector.xpath(selector, {
        identifier,
        adaptive: false,
        autoSave: false,
        variables,
      })
    }
    if (mode === 'text') {
      const targetText = normalizeTextQuery(selector)
      return rootSelector.findByText(targetText, {
        firstMatch: false,
        partial: true,
        cleanMatch: true,
      }) as Selectors
    }
    return rootSelector.css(selector, {
      identifier,
      adaptive: false,
      autoSave: false,
      variables,
    })
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
    const adaptive = options?.adaptive ?? true
    const autoSave = options?.autoSave ?? options?.auto_save ?? true
    const percentage = options?.percentage ?? this.defaultPercentage
    const filter = options?.filter
    const rootSelector = this.createRootSelector(options?.root)

    for (const q of queries) {
      const mode = detectQueryMode(q, options?.mode)
      const rawMatches = this.querySingleDirect(
        rootSelector,
        q,
        mode,
        identifier,
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

    if (!adaptive) {
      return new Selectors()
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
    const parsed = this.parseFindArgs<T>(
      selectorOrSelectors,
      rootOrFilterOrKey,
      filterOrKey,
      key,
    )
    const results = this.resolve<T>(selectorOrSelectors, {
      identifier: parsed.identifier,
      root: parsed.root,
      filter: parsed.filter,
      adaptive: true,
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
    const parsed = this.parseFindArgs<T>(
      selectorOrSelectors,
      rootOrFilterOrKey,
      filterOrKey,
      key,
    )
    const results = this.resolve<T>(selectorOrSelectors, {
      identifier: parsed.identifier,
      root: parsed.root,
      filter: parsed.filter,
      adaptive: true,
      autoSave: true,
      multiple: true,
    })
    return results
      .map((s) => s.rawNode as T)
      .filter((el): el is T => Boolean(el))
  }

  private parseFindArgs<T extends HTMLElement = HTMLElement>(
    selectorOrSelectors: string | readonly string[],
    arg1?: Element | Document | ElementFilter<T> | string,
    arg2?: ElementFilter<T> | string,
    arg3?: string,
  ): {
    root?: Element | Document
    filter?: ElementFilter<T>
    identifier: string
  } {
    const defaultKey =
      typeof selectorOrSelectors === 'string'
        ? selectorOrSelectors
        : (selectorOrSelectors[0] ?? 'default')

    let root: Element | Document | undefined
    let filter: ElementFilter<T> | undefined
    let identifier = defaultKey

    if (typeof arg1 === 'function') {
      filter = arg1 as ElementFilter<T>
      if (typeof arg2 === 'string') {
        identifier = arg2
      }
    } else if (typeof arg1 === 'object' && arg1 !== null) {
      root = arg1 as Element | Document
      if (typeof arg2 === 'function') {
        filter = arg2 as ElementFilter<T>
        if (typeof arg3 === 'string') {
          identifier = arg3
        }
      } else if (typeof arg2 === 'string') {
        identifier = arg2
      }
    } else if (typeof arg1 === 'string') {
      identifier = arg1
    }

    return { root, filter, identifier }
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

    const scopeRoot =
      !root || root.nodeType === 9
        ? ((root as Document | undefined)?.documentElement ?? this.doc.documentElement)
        : (root as Element)

    const candidates = collectDeepElements(scopeRoot, true, false)
    let bestElement: Element | null = null
    let bestScore = -1

    for (const candidate of candidates) {
      if (filter && !filter(candidate as T)) continue
      const score = calculateSimilarityScore(fingerprint, candidate)
      if (score > bestScore) {
        bestScore = score
        bestElement = candidate
      }
    }

    if (bestElement && bestScore >= percentage) {
      return {
        element: bestElement,
        selector: new Selector({
          root: bestElement,
          url: this.url,
          adaptive: true,
          pierceShadow: true,
          _storage: this.storage,
        }),
        score: bestScore,
      }
    }

    return null
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

    const scopeRoot =
      !root || root.nodeType === 9
        ? ((root as Document | undefined)?.documentElement ?? this.doc.documentElement)
        : (root as Element)

    const candidates = collectDeepElements(scopeRoot, true, false)
    const scored: Array<{ element: Element; score: number }> = []
    let bestElement: Element | null = null
    let bestScore = -1

    for (const candidate of candidates) {
      if (candidate.tagName.toLowerCase() !== fingerprint.tag) continue
      if (filter && !filter(candidate as T)) continue
      const score = calculateSimilarityScore(fingerprint, candidate)
      scored.push({ element: candidate, score })
      if (score > bestScore) {
        bestScore = score
        bestElement = candidate
      }
    }

    if (!bestElement || bestScore < percentage) {
      return []
    }

    const primaryAttrs: Record<string, string> = {}
    for (let i = 0; i < bestElement.attributes.length; i++) {
      const attr = bestElement.attributes.item(i)
      if (attr && attr.name !== 'href' && attr.name !== 'src' && attr.name !== 'id') {
        primaryAttrs[attr.name] = attr.value
      }
    }

    const minCutoff = Math.max(percentage - 10, bestScore - 18)
    const matched: Array<{ element: Element; selector: Selector; score: number }> = []

    for (const item of scored) {
      const isPrimary = item.element === bestElement
      const isAlike =
        item.score >= minCutoff &&
        areElementsAlike(
          bestElement,
          primaryAttrs,
          item.element,
          ['href', 'src', 'id', 'data-jk'],
          0.5,
          false,
        )
      if (isPrimary || isAlike) {
        matched.push({
          element: item.element,
          selector: new Selector({
            root: item.element,
            url: this.url,
            adaptive: true,
            pierceShadow: true,
            _storage: this.storage,
          }),
          score: item.score,
        })
      }
    }

    return matched
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
    const mode = detectQueryMode(options.selector, options.mode)
    const identifier = options.identifier ?? options.selector
    const percentage = options.percentage ?? this.defaultPercentage
    const autoUpdate = options.autoUpdateFingerprint ?? true
    let currentElement: Element | null = null
    let timer: ReturnType<typeof setTimeout> | null = null
    let stopped = false
    const observedRoots = new WeakSet<Node>()

    const syncShadowObservers = (obs: MutationObserver) => {
      if (!observedRoots.has(this.doc.documentElement)) {
        observedRoots.add(this.doc.documentElement)
        obs.observe(this.doc.documentElement, {
          childList: true,
          subtree: true,
          attributes: true,
        })
      }
      const shadowRoots = collectDeepShadowRoots(this.doc.documentElement)
      for (const sr of shadowRoots) {
        if (!observedRoots.has(sr)) {
          observedRoots.add(sr)
          obs.observe(sr, {
            childList: true,
            subtree: true,
            attributes: true,
          })
        }
      }
    }

    const evaluateNow = () => {
      if (stopped) return
      const rootSelector = this.page
      if (currentElement && isDeepConnected(this.doc.documentElement, currentElement)) {
        const directMatches = this.querySingleDirect(
          rootSelector,
          options.selector,
          mode,
          identifier,
        )
        if (directMatches.length > 0 && directMatches[0].rawNode === currentElement) {
          return
        }
      }

      const direct = this.querySingleDirect(
        rootSelector,
        options.selector,
        mode,
        identifier,
      )

      if (direct.length > 0 && direct[0].rawNode) {
        const foundEl = direct[0].rawNode
        this.storage.save(foundEl, identifier)
        if (foundEl !== currentElement) {
          currentElement = foundEl
          options.onResolved?.(foundEl as HTMLElement, false, 100)
        }
        return
      }

      const oldFingerprint = rootSelector.retrieve(identifier)
      if (oldFingerprint) {
        const relocated = this.relocateWithScore(oldFingerprint, percentage)
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
        currentElement = null
        options.onLost?.()
      }
    }

    const observer = new MutationObserver(() => {
      if (stopped) return
      syncShadowObservers(observer)
      if (timer !== null) {
        clearTimeout(timer)
      }
      timer = setTimeout(() => {
        timer = null
        syncShadowObservers(observer)
        evaluateNow()
      }, this.debounceMs)
    })

    syncShadowObservers(observer)
    evaluateNow()

    const stop = () => {
      if (stopped) return
      stopped = true
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      observer.disconnect()
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
    return new Promise<R | null>((resolve) => {
      let settled = false
      const observedRoots = new WeakSet<Node>()

      const checkNow = (): boolean => {
        if (settled) return true
        try {
          const res = condition()
          if (res) {
            settled = true
            cleanup()
            resolve(res)
            return true
          }
        } catch {}
        return false
      }

      const syncObservers = (obs: MutationObserver) => {
        if (!observedRoots.has(this.doc.documentElement)) {
          observedRoots.add(this.doc.documentElement)
          obs.observe(this.doc.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
          })
        }
        for (const sr of collectDeepShadowRoots(this.doc.documentElement)) {
          if (!observedRoots.has(sr)) {
            observedRoots.add(sr)
            obs.observe(sr, {
              childList: true,
              subtree: true,
              attributes: true,
            })
          }
        }
      }

      const observer = new MutationObserver(() => {
        if (settled) return
        syncObservers(observer)
        checkNow()
      })

      const intervalId = setInterval(() => {
        checkNow()
      }, pollMs)

      const timeoutId = setTimeout(() => {
        if (settled) return
        settled = true
        cleanup()
        resolve(null)
      }, timeoutMs)

      const cleanup = () => {
        clearInterval(intervalId)
        clearTimeout(timeoutId)
        observer.disconnect()
        this.activeStoppers.delete(cleanup)
      }

      this.activeStoppers.add(cleanup)
      syncObservers(observer)
      checkNow()
    })
  }

  async destroy(): Promise<void> {
    for (const stop of Array.from(this.activeStoppers)) {
      stop()
    }
    this.activeStoppers.clear()
    this.relocateListeners.clear()
    const s = this.storage as any
    if (typeof s.flush === 'function') {
      await s.flush()
    }
    if (typeof this.storage.close === 'function') {
      await this.storage.close()
    }
  }
}
