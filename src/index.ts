import { resolveDomAdapter } from './core/dom-adapter'
import { isElementNode } from './core/dom-utils'
import {
  relocateAll,
  relocateBest,
  relocateHighestScoring,
  type RelocationMatch,
  type ScoredCandidates,
} from './core/relocator'
import { collectQueryContextRoots } from './core/shadow-dom'
import { areElementsAlike, calculateSimilarityScore } from './core/similarity'
import {
  emitRelocated,
  getFingerprint,
  isValidFingerprint,
  LruMap,
  loadScopeStorage,
  onRelocated,
  resetStorage,
  saveFingerprint,
  setStorage,
} from './core/storage'
import { StorageTools, getElementDirectText } from './core/storage-tools'
import { cleanSpaces, cleanText, replaceEntities } from './core/text-utils'
import {
  cssToXpath,
  extractTypePositionFilters,
  splitCssSelectors,
} from './core/translator'
import {
  collectAllText,
  extractJson,
  findAncestor,
  getAllText,
  getAncestors,
  getAttributes,
  getBelowElements,
  getChildren,
  getDirectText,
  getNextSibling,
  getParent,
  getPath,
  getPreviousSibling,
  getSiblings,
  hasClass,
  matchRegex,
  prettifyHtml,
  re,
  reFirst,
  searchAttributes,
  urljoin,
  type RootTarget,
} from './parser/dom-traversal'
import {
  findAllByRegex,
  findAllByText,
  findAllPredicates,
  findByRegex,
  findByText,
  findPredicates,
  findSimilar,
  parseFindAllArguments,
  type FindAllArguments,
} from './parser/element-finder'
import {
  readHandleOuterHtml,
  resolveElementHandle,
  type ElementHandleLike,
} from './parser/element-handle'
import {
  formatPrettyHtml,
  loadSelectorRoot,
  type InternalNodeWrapper,
} from './parser/html-loader'
import {
  filterByTypePosition,
  interpolateCssSelector,
  interpolateXPathSelector,
  resolveCssQuerySettings,
  resolveXPathQuerySettings,
  runXPathQuery,
  tryNativeCssQuery,
} from './parser/query-runner'
import type {
  AdaptiveQueryOptions,
  BoundingRectInfo,
  ElementFingerprint,
  FindByRegexOptions,
  FindByTextOptions,
  FindPredicate,
  FindSimilarOptions,
  GetAllTextOptions,
  PageContentProvider,
  PageOptions,
  RegexExtractOptions,
  RelocatedCallback,
  RelocationInfo,
  SimpleStorage,
} from './types'

/** Current package version. */
export const VERSION = '0.5.0'

/** Default similarity score threshold (0–100) required to accept a relocated element. */
export const DEFAULT_THRESHOLD = 40

/** Volatile attributes ignored by default during adaptive relocation (`href`, `src`, `id`). */
export const DEFAULT_IGNORE_ATTRS = ['href', 'src', 'id'] as const

/**
 * Builds a serializable structural and semantic fingerprint (`ElementFingerprint`) for a DOM `Element`.
 * Useful when manually inspecting or persisting fingerprints outside `page.find()` / `page.findAll()`.
 */
export function extractFingerprint(
  element: Element,
  includeRect = false,
): ElementFingerprint {
  return StorageTools.elementToDict(element, includeRect)
}

export {
  // Baseline storage & relocation analytics
  onRelocated,
  resetStorage,
  setStorage,
  getFingerprint,
  saveFingerprint,
  isValidFingerprint,
  LruMap,
  StorageTools,
  // Relocation & similarity standalone functions
  relocateBest,
  relocateAll,
  relocateHighestScoring,
  calculateSimilarityScore,
  areElementsAlike,
  // Predicate, text, regex & similar element search standalone functions
  findPredicates,
  findAllPredicates,
  parseFindAllArguments,
  findByText,
  findAllByText,
  findByRegex,
  findAllByRegex,
  findSimilar,
  // DOM traversal standalone functions
  getParent,
  getChildren,
  getSiblings,
  getNextSibling,
  getPreviousSibling,
  getAncestors,
  getPath,
  findAncestor,
  getBelowElements,
  // Text, regex, JSON, attributes & URL standalone functions
  getAllText,
  getDirectText,
  cleanText,
  cleanSpaces,
  replaceEntities,
  re,
  reFirst,
  matchRegex,
  extractJson,
  getAttributes,
  searchAttributes,
  hasClass,
  prettifyHtml,
  urljoin,
  // CSS -> XPath translator
  cssToXpath,
  // Types
  type AdaptiveQueryOptions,
  type BoundingRectInfo,
  type ElementFingerprint,
  type ElementHandleLike,
  type FindAllArguments,
  type FindByRegexOptions,
  type FindByTextOptions,
  type FindPredicate,
  type FindSimilarOptions,
  type GetAllTextOptions,
  type PageContentProvider,
  type PageOptions,
  type RegexExtractOptions,
  type RelocatedCallback,
  type RelocationInfo,
  type RelocationMatch,
  type RootTarget,
  type ScoredCandidates,
  type SimpleStorage,
}

export {
  browserDomAdapter,
  getDomAdapter,
  setDomAdapter,
  type DomAdapter,
  type DomMimeType,
  type XPathNodeSnapshot,
} from './core/dom-adapter'

export {
  DomAdapterError,
  ElementHandleError,
  SelectorSyntaxError,
} from './core/errors'

/**
 * Adaptive scraping wrapper around a DOM root `Element`.
 * All selector queries (`find`, `findAll`, `css`, `xpath`) automatically save fingerprints on match
 * and self-heal when selectors break after a site redesign.
 */
export interface Page {
  /** Scope key used to isolate saved fingerprints in storage (usually the page URL). */
  readonly url: string
  /** Root DOM `Element` of this page or fragment. */
  readonly root: Element
  /**
   * Finds the first matching `Element` by CSS or XPath selector (auto-detected).
   * Saves its fingerprint on match; relocates the best match if the selector breaks.
   */
  find<T extends Element = Element>(
    selector: string,
    keyOrOptions?: string | AdaptiveQueryOptions,
  ): Promise<T | null>
  /**
   * Finds all matching `Element[]` by CSS or XPath selector (auto-detected).
   * Saves the primary fingerprint on match; relocates the full list of peer elements if broken.
   */
  findAll<T extends Element = Element>(
    selector: string,
    keyOrOptions?: string | AdaptiveQueryOptions,
  ): Promise<T[]>
  /** Adaptive CSS query returning all matching `Element[]` (with self-healing fallback). */
  css<T extends Element = Element>(
    selector: string,
    keyOrOptions?: string | AdaptiveQueryOptions,
  ): Promise<T[]>
  /** Adaptive XPath query returning all matching `Element[]` (with self-healing fallback). */
  xpath<T extends Element = Element>(
    expression: string,
    keyOrOptions?: string | AdaptiveQueryOptions,
  ): Promise<T[]>
  /** Finds the first element matching a combination of tag names, attribute maps, RegExp, or filter functions. */
  findPredicates<T extends Element = Element>(...predicates: FindPredicate[]): T | null
  /** Finds all elements matching a combination of tag names, attribute maps, RegExp, or filter functions. */
  findAllPredicates<T extends Element = Element>(...predicates: FindPredicate[]): T[]
  /** Finds element(s) by direct text content (supports `partial`, `caseSensitive`, `cleanMatch`). */
  findByText<T extends Element = Element>(
    text: string,
    options?: boolean | FindByTextOptions,
    partial?: boolean,
    caseSensitive?: boolean,
    cleanMatch?: boolean,
  ): T | T[] | null
  /** Finds all elements matching the given direct text content. */
  findAllByText<T extends Element = Element>(
    text: string,
    options?: Omit<FindByTextOptions, 'firstMatch' | 'first_match'>,
  ): T[]
  /** Finds element(s) whose direct text matches a `RegExp` or regex pattern string. */
  findByRegex<T extends Element = Element>(
    query: string | RegExp,
    options?: boolean | FindByRegexOptions,
    caseSensitive?: boolean,
    cleanMatch?: boolean,
  ): T | T[] | null
  /** Finds all elements whose direct text matches a `RegExp` or regex pattern string. */
  findAllByRegex<T extends Element = Element>(
    query: string | RegExp,
    options?: Omit<FindByRegexOptions, 'firstMatch' | 'first_match'>,
  ): T[]
  /** Finds peer elements at the same DOM depth that are structurally/semantically similar to `element`. */
  findSimilar<T extends Element = Element>(
    element: Element,
    options?: number | FindSimilarOptions,
    ignoreAttributes?: readonly string[],
    matchText?: boolean,
  ): T[]
  /** Collects all descendant text nodes joined by `separator` (ignoring `<script>` and `<style>` by default). */
  getAllText(
    separatorOrOptions?: string | GetAllTextOptions,
    strip?: boolean,
    ignoreTags?: readonly string[],
    validValues?: boolean,
  ): string
  /** Manually saves an `Element` or `ElementFingerprint` under `key` for this page's `url` scope. */
  save(element: Element | ElementFingerprint, key: string): void
  /** Retrieves a previously saved `ElementFingerprint` by `key` for this page's `url` scope. */
  retrieve(key: string): ElementFingerprint | null
  /** Manually relocates elements matching `elementOrFingerprint` within this page above `percentage` score. */
  relocate(
    elementOrFingerprint: Element | ElementFingerprint,
    percentage?: number,
  ): Element[]
  /** Resolves a relative URL against this page's `url`. */
  urljoin(relativeUrl: string): string
  /** Returns a human-readable, indented HTML string of this page's root element. */
  prettify(): string
}

function isXPathSelector(selector: string): boolean {
  const trimmed = selector.trim()
  return trimmed.startsWith('/') || trimmed.startsWith('./') || trimmed.startsWith('(')
}

function unwrapElements(items: readonly (Element | InternalNodeWrapper)[]): Element[] {
  const out: Element[] = []
  const seen = new Set<Element>()
  for (const item of items) {
    const el =
      'kind' in item
        ? item.kind === 'element'
          ? item.element
          : item.parentElement
        : item
    if (el && !seen.has(el)) {
      seen.add(el)
      out.push(el)
    }
  }
  return out
}

function queryDirectCssBranch(
  root: Element,
  branch: string,
  pierceShadow: boolean,
  dom: ReturnType<typeof resolveDomAdapter>,
  contextRoots: readonly Element[],
): Element[] {
  const typePos = extractTypePositionFilters(branch)
  const executable = typePos ? typePos.selector : branch
  const xpathExpr = cssToXpath(executable)
  const nativeHits = tryNativeCssQuery(root, executable, contextRoots)
  if (nativeHits) {
    const filtered = typePos
      ? filterByTypePosition(nativeHits, typePos.filters, typePos.nativeVerifySelector)
      : nativeHits
    return unwrapElements(filtered)
  }
  const xpathHits = runXPathQuery(root, xpathExpr, pierceShadow, executable, dom, contextRoots)
  const filtered = typePos
    ? filterByTypePosition(xpathHits, typePos.filters, typePos.nativeVerifySelector)
    : xpathHits
  return unwrapElements(filtered)
}

function queryDirectCss(
  root: Element,
  selector: string,
  pierceShadow: boolean,
  dom: ReturnType<typeof resolveDomAdapter>,
): Element[] {
  const contextRoots = collectQueryContextRoots(root, pierceShadow)
  const branches = selector.includes(',') ? splitCssSelectors(selector) : [selector]
  if (branches.length === 1) {
    return queryDirectCssBranch(root, branches[0], pierceShadow, dom, contextRoots)
  }
  const combined: Element[] = []
  const seen = new Set<Element>()
  for (const branch of branches) {
    for (const el of queryDirectCssBranch(root, branch, pierceShadow, dom, contextRoots)) {
      if (!seen.has(el)) {
        seen.add(el)
        combined.push(el)
      }
    }
  }
  return combined
}

function queryDirectXPath(
  root: Element,
  expression: string,
  pierceShadow: boolean,
  dom: ReturnType<typeof resolveDomAdapter>,
): Element[] {
  const raw = runXPathQuery(root, expression, pierceShadow, expression, dom)
  return unwrapElements(raw)
}

interface ResolvedCallQuery {
  id: string
  execSelector: string
  adaptive: boolean
  autoSave: boolean
  percentage: number
}

function resolveCallOptions(
  selector: string,
  keyOrOptions: string | AdaptiveQueryOptions | undefined,
  useXPath: boolean,
  defaultThreshold: number,
): ResolvedCallQuery {
  if (typeof keyOrOptions === 'string' || keyOrOptions === undefined) {
    return {
      id: keyOrOptions || selector,
      execSelector: selector,
      adaptive: true,
      autoSave: true,
      percentage: defaultThreshold,
    }
  }
  const adaptive = typeof keyOrOptions.adaptive === 'boolean' ? keyOrOptions.adaptive : true
  if (useXPath) {
    const settings = resolveXPathQuerySettings(
      keyOrOptions,
      undefined,
      defaultThreshold,
      undefined,
      { autoSave: true },
    )
    const execSelector =
      Object.keys(settings.variables).length > 0
        ? interpolateXPathSelector(selector, settings.variables)
        : selector
    return {
      id: settings.identifier || selector,
      execSelector,
      adaptive,
      autoSave: settings.autoSave,
      percentage:
        typeof keyOrOptions.percentage === 'number'
          ? keyOrOptions.percentage
          : defaultThreshold,
    }
  }
  const settings = resolveCssQuerySettings(
    keyOrOptions,
    undefined,
    defaultThreshold,
    undefined,
    { autoSave: true },
  )
  const execSelector =
    Object.keys(settings.variables).length > 0
      ? interpolateCssSelector(selector, settings.variables)
      : selector
  return {
    id: settings.identifier || selector,
    execSelector,
    adaptive,
    autoSave: settings.autoSave,
    percentage:
      typeof keyOrOptions.percentage === 'number'
        ? keyOrOptions.percentage
        : defaultThreshold,
  }
}

function createPage(
  root: Element,
  options?: PageOptions | string,
): Page {
  const opts: PageOptions = typeof options === 'string' ? { url: options } : (options ?? {})
  const url = opts.url ?? root.ownerDocument?.location?.href ?? ''
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD
  const pierceShadow = opts.pierceShadow ?? true
  const dom = resolveDomAdapter(opts.dom)
  const scopedCallback = opts.onRelocated

  const directQuery = (selector: string, useXPath: boolean): Element[] => {
    return useXPath
      ? queryDirectXPath(root, selector, pierceShadow, dom)
      : queryDirectCss(root, selector, pierceShadow, dom)
  }

  const runSingle = async <T extends Element = Element>(
    selector: string,
    keyOrOptions?: string | AdaptiveQueryOptions,
    mode: 'auto' | 'css' | 'xpath' = 'auto',
  ): Promise<T | null> => {
    const useXPath = mode === 'xpath' || (mode === 'auto' && isXPathSelector(selector))
    const call = resolveCallOptions(selector, keyOrOptions, useXPath, threshold)
    const direct = directQuery(call.execSelector, useXPath)
    if (direct.length > 0) {
      if (call.autoSave) {
        saveFingerprint(url, call.id, StorageTools.elementToDict(direct[0]))
      }
      return direct[0] as T
    }

    if (!call.adaptive) {
      return null
    }

    const saved = getFingerprint(url, call.id)
    if (saved) {
      const match = relocateBest(
        saved,
        root,
        call.percentage,
        undefined,
        pierceShadow,
        DEFAULT_IGNORE_ATTRS,
      )
      if (match) {
        if (call.autoSave) {
          saveFingerprint(url, call.id, StorageTools.elementToDict(match.element))
        }
        emitRelocated(
          {
            foundSuccessfully: true,
            key: call.id,
            selector,
            score: match.score,
            element: match.element,
            elements: [match.element],
            url,
          },
          scopedCallback,
        )
        return match.element as T
      }
    }

    emitRelocated(
      {
        foundSuccessfully: false,
        key: call.id,
        selector,
        score: 0,
        element: null,
        elements: [],
        url,
      },
      scopedCallback,
    )
    return null
  }

  const runMultiple = async <T extends Element = Element>(
    selector: string,
    keyOrOptions?: string | AdaptiveQueryOptions,
    mode: 'auto' | 'css' | 'xpath' = 'auto',
  ): Promise<T[]> => {
    const useXPath = mode === 'xpath' || (mode === 'auto' && isXPathSelector(selector))
    const call = resolveCallOptions(selector, keyOrOptions, useXPath, threshold)
    const direct = directQuery(call.execSelector, useXPath)
    if (direct.length > 0) {
      if (call.autoSave) {
        saveFingerprint(url, call.id, StorageTools.elementToDict(direct[0]))
      }
      return direct as T[]
    }

    if (!call.adaptive) {
      return []
    }

    const saved = getFingerprint(url, call.id)
    if (saved) {
      const matches = relocateAll(
        saved,
        root,
        call.percentage,
        DEFAULT_IGNORE_ATTRS,
        undefined,
        pierceShadow,
      )
      if (matches.length > 0) {
        const elements = matches.map((m) => m.element)
        if (call.autoSave) {
          saveFingerprint(url, call.id, StorageTools.elementToDict(elements[0]))
        }
        emitRelocated(
          {
            foundSuccessfully: true,
            key: call.id,
            selector,
            score: matches[0].score,
            element: elements[0],
            elements,
            url,
          },
          scopedCallback,
        )
        return elements as T[]
      }
    }

    emitRelocated(
      {
        foundSuccessfully: false,
        key: call.id,
        selector,
        score: 0,
        element: null,
        elements: [],
        url,
      },
      scopedCallback,
    )
    return []
  }

  return {
    url,
    root,
    find: (selector, keyOrOptions) => runSingle(selector, keyOrOptions, 'auto'),
    findAll: (selector, keyOrOptions) => runMultiple(selector, keyOrOptions, 'auto'),
    css: (selector, keyOrOptions) => runMultiple(selector, keyOrOptions, 'css'),
    xpath: (expression, keyOrOptions) => runMultiple(expression, keyOrOptions, 'xpath'),
    findPredicates: (...predicates) => findPredicates(root, ...predicates),
    findAllPredicates: (...predicates) => findAllPredicates(root, ...predicates),
    findByText: (text, firstMatchOrOptions = true, partial = false, caseSensitive = false, cleanMatch = true) =>
      findByText(root, text, firstMatchOrOptions as any, partial, caseSensitive, cleanMatch),
    findAllByText: (text, textOpts) => findAllByText(root, text, textOpts),
    findByRegex: (query, firstMatchOrOptions = true, caseSensitive = false, cleanMatch = true) =>
      findByRegex(root, query, firstMatchOrOptions as any, caseSensitive, cleanMatch),
    findAllByRegex: (query, regexOpts) => findAllByRegex(root, query, regexOpts),
    findSimilar: (el, simOpts = 0.2, ignoreAttrs = ['href', 'src'], matchTxt = false) =>
      findSimilar(el, simOpts, ignoreAttrs, matchTxt, dom),
    getAllText: (separatorOrOptions = '\n', strip = false, ignoreTags = ['script', 'style'], validValues = true) =>
      collectAllText(root, pierceShadow, separatorOrOptions, strip, ignoreTags, validValues),
    save: (elementOrFp, key) => {
      const fp = isElementNode(elementOrFp)
        ? StorageTools.elementToDict(elementOrFp)
        : elementOrFp
      saveFingerprint(url, key, fp)
    },
    retrieve: (key) => getFingerprint(url, key),
    relocate: (elementOrFp, pct = threshold) => {
      const fp = isElementNode(elementOrFp)
        ? StorageTools.elementToDict(elementOrFp)
        : elementOrFp
      return relocateHighestScoring(fp, root, pct, pierceShadow, DEFAULT_IGNORE_ATTRS)
    },
    urljoin: (relativeUrl) => urljoin(url, relativeUrl),
    prettify: () => formatPrettyHtml(root),
  }
}

/**
 * Wraps a browser or JSDOM/LinkeDOM `Document` into an adaptive `Page` and preloads saved fingerprints for its `url`.
 */
export async function fromDocument(
  doc: Document = document,
  options?: PageOptions | string,
): Promise<Page> {
  const opts: PageOptions = typeof options === 'string' ? { url: options } : (options ?? {})
  const url = opts.url ?? doc.location?.href ?? ''
  await loadScopeStorage(url)
  return createPage(doc.documentElement, { ...opts, url })
}

/**
 * Wraps a subtree `Element` into an adaptive `Page` (queries only see descendants of `element`).
 */
export async function fromElement(
  element: Element,
  options?: PageOptions | string,
): Promise<Page> {
  const opts: PageOptions = typeof options === 'string' ? { url: options } : (options ?? {})
  const url = opts.url ?? element.ownerDocument?.location?.href ?? ''
  await loadScopeStorage(url)
  return createPage(element, { ...opts, url })
}

/**
 * Parses an HTML string into a DOM tree and returns an adaptive `Page` with preloaded storage for `options.url`.
 */
export async function fromHtml(
  html: string,
  options?: PageOptions | string,
): Promise<Page> {
  const opts: PageOptions = typeof options === 'string' ? { url: options } : (options ?? {})
  const url = opts.url ?? ''
  const dom = resolveDomAdapter(opts.dom)
  const loaded = loadSelectorRoot(html, false, 'utf-8', dom)
  if (loaded.wrapper.kind !== 'element') {
    throw new Error('Failed to parse HTML into an Element root')
  }
  await loadScopeStorage(url)
  return createPage(loaded.wrapper.element, { ...opts, url })
}

/**
 * Snapshots a Playwright or Puppeteer `Page` (`page.content()` + `page.url()`) into an adaptive `Page`.
 */
export async function fromPage(
  page: PageContentProvider,
  options?: PageOptions | string,
): Promise<Page> {
  const opts: PageOptions = typeof options === 'string' ? { url: options } : (options ?? {})
  let pageUrl = ''
  if (typeof page.url === 'function') {
    try {
      pageUrl = page.url()
    } catch {}
  }
  const url = opts.url ?? pageUrl
  const html = await page.content()
  return fromHtml(html, { ...opts, url })
}

/**
 * Snapshots `outerHTML` from a Playwright or Puppeteer `ElementHandle` into an adaptive `Page`.
 */
export async function fromHandle(
  handle: unknown,
  options?: PageOptions | string,
): Promise<Page> {
  const elementHandle = resolveElementHandle(handle)
  const html = await readHandleOuterHtml(elementHandle)
  return fromHtml(html, options)
}
