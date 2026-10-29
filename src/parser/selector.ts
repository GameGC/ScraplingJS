import type {
  AdaptiveQueryOptions,
  ElementFingerprint,
  FindByRegexOptions,
  FindByTextOptions,
  FindSimilarOptions,
  GetAllTextOptions,
  RegexExtractOptions,
  SelectorOptions,
  StorageSystem,
} from '../types'
import {
  AttributesHandler,
  TextHandler,
  TextHandlers,
} from '../core/custom-types'
import { resolveDomAdapter, type DomAdapter } from '../core/dom-adapter'
import { isElementNode } from '../core/dom-utils'
import { ElementHandleError } from '../core/errors'
import { generateElementSelector } from '../core/mixins'
import { relocateHighestScoring } from '../core/relocator'
import { calculateSimilarityScore } from '../core/similarity'
import { StorageTools, getElementDirectText } from '../core/storage-tools'
import {
  cssToXpath,
  extractTypePositionFilters,
  splitCssSelectors,
} from '../core/translator'
import { cleanSpaces } from '../core/utils'
import {
  collectDeepElements,
  collectQueryContextRoots,
  getDeepParentElement,
} from '../core/shadow-dom'
import { AutoStorageSystem, MemoryStorageSystem, StorageSystemMixin } from '../storage'
import {
  collectAllText,
  getAncestorElements,
  getChildElements,
} from './dom-traversal'
import {
  findElementsByRegex,
  findElementsByText,
  findSimilarElements,
  parseFindAllArguments,
} from './element-finder'
import {
  isRemoteHandle,
  readHandleOuterHtml,
  resolveElementHandle,
  type PageContentProvider,
} from './element-handle'
import {
  formatPrettyHtml,
  loadSelectorRoot,
  type InternalNodeWrapper,
} from './html-loader'
import {
  filterByTypePosition,
  interpolateCssSelector,
  interpolateXPathSelector,
  resolveCssQuerySettings,
  resolveXPathQuerySettings,
  runXPathQuery,
  tryNativeCssQuery,
  type CssQuerySettings,
} from './query-runner'
import { Selectors } from './selectors'

export type { InternalNodeWrapper } from './html-loader'

export function isDomRootNode(
  value: unknown,
): value is Element | Document | DocumentFragment | ShadowRoot {
  if (!value || typeof value !== 'object') return false
  const nodeType = (value as Node).nodeType
  return nodeType === 1 || nodeType === 9 || nodeType === 11
}

export class Selector {
  readonly url: string
  readonly encoding: string
  private readonly _pierceShadow: boolean
  private readonly _keepComments: boolean
  private readonly _rawBody: string | Uint8Array
  private readonly _wrapper: InternalNodeWrapper
  private readonly _dom: DomAdapter
  readonly _storage: StorageSystem | null
  private _textCache: TextHandler | null = null
  private _attributesCache: AttributesHandler | null = null
  private _tagCache: string | null = null

  constructor(
    contentOrOptions?: string | Uint8Array | Element | Document | SelectorOptions,
    options?: SelectorOptions,
  ) {
    let opts: SelectorOptions = {}
    if (
      typeof contentOrOptions === 'string' ||
      contentOrOptions instanceof Uint8Array
    ) {
      opts = { ...options, content: contentOrOptions }
    } else if (isDomRootNode(contentOrOptions)) {
      opts = { ...options, root: contentOrOptions }
    } else if (contentOrOptions && typeof contentOrOptions === 'object') {
      if (isRemoteHandle(contentOrOptions)) {
        throw new ElementHandleError(
          'Selector cannot wrap a Puppeteer or Playwright ElementHandle synchronously: the handle is a remote reference owned by another process. Use `await Selector.fromHandle(handle)` to snapshot its HTML, or build the Selector inside the page.',
        )
      }
      opts = { ...contentOrOptions, ...options }
    } else if (contentOrOptions !== undefined && contentOrOptions !== null) {
      throw new TypeError(
        `content argument must be str or bytes, got ${typeof contentOrOptions}`,
      )
    } else if (options) {
      opts = { ...options }
    }

    if (opts.root === undefined && opts.content === undefined) {
      throw new Error('Selector class needs HTML content, or root arguments to work')
    }

    const adaptiveDomain = opts.adaptiveDomain ?? opts.adaptive_domain ?? ''
    this.url = adaptiveDomain || opts.url || ''
    this.encoding = opts.encoding ?? 'utf-8'
    this._keepComments = opts.keepComments ?? opts.keep_comments ?? false
    this._pierceShadow = opts.pierceShadow ?? opts.pierce_shadow ?? true
    this._storage = null
    this._dom = resolveDomAdapter(opts.dom)

    if (opts.root === undefined) {
      if (typeof opts.content !== 'string' && !(opts.content instanceof Uint8Array)) {
        throw new TypeError(`content argument must be str or bytes, got ${typeof opts.content}`)
      }
    }
    const rootOrContent = opts.root === undefined ? opts.content : opts.root
    if (rootOrContent === undefined) {
      throw new Error('Selector class needs HTML content, or root arguments to work')
    }
    const loaded = loadSelectorRoot(
      rootOrContent,
      this._keepComments,
      this.encoding,
      this._dom,
    )
    this._wrapper = loaded.wrapper
    this._rawBody = loaded.rawBody

    if (this._wrapper.kind === 'text') {
      return this.createProxy()
    }

    if (opts._storage) {
      this._storage = opts._storage
    } else if (opts.storage !== undefined) {
      const storageArg = opts.storage
      const storageArgs = opts.storageArgs ??
        opts.storage_args ?? {
          storage_file: ':default:',
          url: this.url,
        }
      if (
        typeof storageArg === 'object' &&
        storageArg !== null &&
        'save' in storageArg &&
        typeof (storageArg as StorageSystem).save === 'function' &&
        'retrieve' in storageArg &&
        typeof (storageArg as StorageSystem).retrieve === 'function'
      ) {
        this._storage = storageArg as StorageSystem
      } else if (
        typeof storageArg === 'function' &&
        (storageArg === MemoryStorageSystem ||
          storageArg === AutoStorageSystem ||
          storageArg.prototype instanceof StorageSystemMixin ||
          (typeof storageArg.prototype?.save === 'function' &&
            typeof storageArg.prototype?.retrieve === 'function'))
      ) {
        const StorageCtor = storageArg as new (options?: unknown) => StorageSystem
        this._storage = new StorageCtor(storageArgs)
      } else {
        throw new Error(
          'Storage system must be inherited from class `StorageSystemMixin` or implement save/retrieve',
        )
      }
    } else {
      const storageArgs = opts.storageArgs ??
        opts.storage_args ?? {
          storage_file: ':default:',
          url: this.url,
        }
      this._storage = new AutoStorageSystem(storageArgs)
    }

    return this.createProxy()
  }

  static fromDocument(
    doc: Document = document,
    options?: Omit<SelectorOptions, 'content' | 'root'>,
  ): Selector {
    return new Selector({
      pierceShadow: true,
      ...options,
      url: options?.url ?? doc.location?.href ?? '',
      root: doc.documentElement,
    })
  }

  static fromElement(
    element: Element,
    options?: Omit<SelectorOptions, 'content' | 'root'>,
  ): Selector {
    return new Selector({
      pierceShadow: true,
      ...options,
      url: options?.url ?? element.ownerDocument?.location?.href ?? '',
      root: element,
    })
  }

  static fromHtml(
    html: string,
    options?: Omit<SelectorOptions, 'content' | 'root'>,
  ): Selector {
    if (typeof html !== 'string') {
      throw new TypeError('Selector.fromHtml() expects an HTML string')
    }
    return new Selector({ ...options, content: html })
  }

  static async fromPage(
    page: PageContentProvider,
    options?: Omit<SelectorOptions, 'content' | 'root'>,
  ): Promise<Selector> {
    if (!page || typeof page.content !== 'function') {
      throw new TypeError(
        'Selector.fromPage() expects a Puppeteer or Playwright Page: an object with a content() method (and usually url()).',
      )
    }
    // Read the live page URL so fingerprints land in the site's domain bucket
    // instead of the shared `default` one.
    let pageUrl = ''
    if (typeof page.url === 'function') {
      try {
        pageUrl = page.url()
      } catch {}
    }
    return new Selector({
      ...options,
      content: await page.content(),
      url: options?.url ?? pageUrl,
    })
  }

  static async fromHandle(
    handle: unknown,
    options?: Omit<SelectorOptions, 'content' | 'root'>,
  ): Promise<Selector> {
    const elementHandle = resolveElementHandle(handle)
    const html = await readHandleOuterHtml(elementHandle)
    return new Selector({ ...options, content: html })
  }

  private createProxy(): this {
    return new Proxy(this, {
      get(target, prop, receiver) {
        if (Reflect.has(target, prop) || typeof prop === 'symbol') {
          const value = Reflect.get(target, prop, receiver) as unknown
          return typeof value === 'function' ? (value as Function).bind(target) : value
        }
        if (typeof prop === 'string') {
          if (target.isTextNode) {
            return undefined
          }
          if (target.attrib.has(prop)) {
            return target.attrib.get(prop)
          }
        }
        return undefined
      },
      has(target, prop) {
        if (typeof prop === 'string' && !target.isTextNode && target.attrib.has(prop)) {
          return true
        }
        return Reflect.has(target, prop)
      },
    })
  }

  get isTextNode(): boolean {
    return this._wrapper.kind === 'text'
  }

  get rawNode(): Element | null {
    return this._wrapper.kind === 'element' ? this._wrapper.element : null
  }

  get _root(): Element | string {
    return this._wrapper.kind === 'element'
      ? this._wrapper.element
      : this._wrapper.textValue
  }

  get domElement(): HTMLElement | null {
    return (this.rawNode as HTMLElement) ?? null
  }

  private convertElement(node: Element | InternalNodeWrapper): Selector {
    return new Selector({
      root: node,
      url: this.url,
      encoding: this.encoding,
      pierceShadow: this._pierceShadow,
      _storage: this._storage ?? undefined,
      keepComments: this._keepComments,
      dom: this._dom,
    })
  }

  private convertElements(nodes: Iterable<Element | InternalNodeWrapper>): Selectors {
    const list: Selector[] = []
    for (const node of nodes) {
      list.push(this.convertElement(node))
    }
    return new Selectors(list)
  }

  get tag(): string {
    if (this._wrapper.kind === 'text') {
      return '#text'
    }
    if (!this._tagCache) {
      this._tagCache = this._wrapper.element.tagName.toLowerCase()
    }
    return this._tagCache
  }

  get text(): TextHandler {
    if (this._wrapper.kind === 'text') {
      return new TextHandler(this._wrapper.textValue)
    }
    if (this._textCache === null) {
      this._textCache = new TextHandler(getElementDirectText(this._wrapper.element))
    }
    return this._textCache
  }

  get attrib(): AttributesHandler {
    if (this._wrapper.kind === 'text') {
      return new AttributesHandler({})
    }
    if (!this._attributesCache) {
      this._attributesCache = new AttributesHandler(this._wrapper.element.attributes)
    }
    return this._attributesCache
  }

  /**
   * Returns an attribute value as a primitive string, or `null` when absent.
   *
   * Prefer this over dot access (`selector.href`) for attributes whose names
   * collide with `Selector` members (`url`, `text`, `tag`, `parent`, `body`, ...):
   * dot access always resolves the class member first.
   */
  attr(name: string): string | null {
    if (this._wrapper.kind === 'text') {
      throw new TypeError('Text nodes do not have attributes')
    }
    const value = this.attrib.get(name, undefined)
    return value == null ? null : value.toString()
  }

  get htmlContent(): TextHandler {
    if (this._wrapper.kind === 'text') {
      return new TextHandler(this._wrapper.textValue)
    }
    return new TextHandler(this._wrapper.element.outerHTML.trim())
  }

  get html_content(): TextHandler {
    return this.htmlContent
  }

  get body(): string | Uint8Array {
    if (this._wrapper.kind === 'text') {
      return ''
    }
    return this._rawBody
  }

  prettify(): TextHandler {
    if (this._wrapper.kind === 'text') {
      return new TextHandler(this._wrapper.textValue)
    }
    return new TextHandler(formatPrettyHtml(this._wrapper.element))
  }

  similarityTo(target: Selector | Element | ElementFingerprint): number {
    if (!this.rawNode) {
      return 0
    }
    const original = StorageTools.elementToDict(this.rawNode)
    if (target instanceof Selector) {
      return target.rawNode ? calculateSimilarityScore(original, target.rawNode) : 0
    }
    return calculateSimilarityScore(original, target)
  }

  hasClass(className: string): boolean {
    if (this._wrapper.kind === 'text') {
      return false
    }
    return this._wrapper.element.classList.contains(className)
  }

  has_class(className: string): boolean {
    return this.hasClass(className)
  }

  getAllText(
    separatorOrOptions: string | GetAllTextOptions = '\n',
    stripOrOptions: boolean | GetAllTextOptions = false,
    ignoreTags: readonly string[] = ['script', 'style'],
    validValues = true,
  ): TextHandler {
    if (this._wrapper.kind === 'text') {
      return new TextHandler(this._wrapper.textValue)
    }
    return new TextHandler(
      collectAllText(
        this._wrapper.element,
        this._pierceShadow,
        separatorOrOptions,
        stripOrOptions,
        ignoreTags,
        validValues,
      ),
    )
  }

  get_all_text(
    separatorOrOptions: string | GetAllTextOptions = '\n',
    stripOrOptions: boolean | GetAllTextOptions = false,
    ignoreTags: readonly string[] = ['script', 'style'],
    validValues = true,
  ): TextHandler {
    return this.getAllText(separatorOrOptions, stripOrOptions, ignoreTags, validValues)
  }

  urljoin(relativeUrl: string): string {
    if (!this.url) {
      return relativeUrl
    }
    try {
      return new URL(relativeUrl, this.url).toString()
    } catch {
      return relativeUrl
    }
  }

  get parent(): Selector | null {
    if (this._wrapper.kind === 'text') {
      return this._wrapper.parentElement
        ? this.convertElement(this._wrapper.parentElement)
        : null
    }
    const parentEl = this._pierceShadow
      ? getDeepParentElement(this._wrapper.element)
      : this._wrapper.element.parentElement
    return parentEl ? this.convertElement(parentEl) : null
  }

  get belowElements(): Selectors {
    if (this._wrapper.kind === 'text') {
      return new Selectors()
    }
    const descendants = collectDeepElements(this._wrapper.element, this._pierceShadow, false)
    return this.convertElements(descendants)
  }

  get below_elements(): Selectors {
    return this.belowElements
  }

  get children(): Selectors {
    if (this._wrapper.kind === 'text') {
      return new Selectors()
    }
    return this.convertElements(
      getChildElements(this._wrapper.element, this._pierceShadow),
    )
  }

  get siblings(): Selectors {
    const parentSel = this.parent
    if (!parentSel || this._wrapper.kind === 'text') {
      return new Selectors()
    }
    return new Selectors(
      parentSel.children.filter((child) => child.rawNode !== this.rawNode),
    )
  }

  *iterancestors(): Generator<Selector, void, unknown> {
    if (this._wrapper.kind === 'text') {
      return
    }
    for (const ancestor of getAncestorElements(
      this._wrapper.element,
      this._pierceShadow,
    )) {
      yield this.convertElement(ancestor)
    }
  }

  findAncestor(func: (ancestor: Selector) => unknown): Selector | null {
    for (const ancestor of this.iterancestors()) {
      const res = func(ancestor)
      if (res instanceof Selectors ? res.length > 0 : Boolean(res)) {
        return ancestor
      }
    }
    return null
  }

  find_ancestor(func: (ancestor: Selector) => unknown): Selector | null {
    return this.findAncestor(func)
  }

  get path(): Selectors {
    return new Selectors(Array.from(this.iterancestors()))
  }

  get next(): Selector | null {
    if (this._wrapper.kind === 'text') {
      return null
    }
    const nextEl = this._wrapper.element.nextElementSibling
    return nextEl ? this.convertElement(nextEl) : null
  }

  get previous(): Selector | null {
    if (this._wrapper.kind === 'text') {
      return null
    }
    const prevEl = this._wrapper.element.previousElementSibling
    return prevEl ? this.convertElement(prevEl) : null
  }

  get generateCssSelector(): string {
    return generateElementSelector(this, 'css', false)
  }

  get generate_css_selector(): string {
    return this.generateCssSelector
  }

  get generateFullCssSelector(): string {
    return generateElementSelector(this, 'css', true)
  }

  get generate_full_css_selector(): string {
    return this.generateFullCssSelector
  }

  get generateXpathSelector(): string {
    return generateElementSelector(this, 'xpath', false)
  }

  get generate_xpath_selector(): string {
    return this.generateXpathSelector
  }

  get generateFullXpathSelector(): string {
    return generateElementSelector(this, 'xpath', true)
  }

  get generate_full_xpath_selector(): string {
    return this.generateFullXpathSelector
  }

  get(): TextHandler {
    if (this._wrapper.kind === 'text') {
      return new TextHandler(this._wrapper.textValue)
    }
    return this.htmlContent
  }

  getall(): TextHandlers {
    return new TextHandlers([this.get()])
  }

  extract(): TextHandlers {
    return this.getall()
  }

  extractFirst(): TextHandler {
    return this.get()
  }

  extract_first(): TextHandler {
    return this.get()
  }

  toString(): string {
    if (this._wrapper.kind === 'text') {
      return this._wrapper.textValue
    }
    return this.htmlContent.toString()
  }

  __str__(): string {
    return this.toString()
  }

  __repr__(): string {
    const lengthLimit = 40
    if (this._wrapper.kind === 'text') {
      let t = this._wrapper.textValue
      if (t.length > lengthLimit) {
        t = `${t.slice(0, lengthLimit).trim()}...`
      }
      return `<text='${t}'>`
    }
    let content = cleanSpaces(this.htmlContent.toString())
    if (content.length > lengthLimit) {
      content = `${content.slice(0, lengthLimit).trim()}...`
    }
    let data = `<data='${content}'`
    if (this.parent) {
      let parentContent = cleanSpaces(this.parent.htmlContent.toString())
      if (parentContent.length > lengthLimit) {
        parentContent = `${parentContent.slice(0, lengthLimit).trim()}...`
      }
      data += ` parent='${parentContent}'`
    }
    return `${data}>`
  }

  relocate(
    element: ElementFingerprint | Element | Selector,
    percentageOrOptions?: number | { percentage?: number; selectorType?: false; selector_type?: false },
    selectorType?: false,
  ): Element[]
  relocate(
    element: ElementFingerprint | Element | Selector,
    percentageOrOptions: number | { percentage?: number; selectorType: true } | { percentage?: number; selector_type: true },
    selectorType?: true,
  ): Selectors
  relocate(
    element: ElementFingerprint | Element | Selector,
    percentageOrOptions:
      | number
      | { percentage?: number; selectorType?: boolean; selector_type?: boolean } = 40,
    selectorType = false,
  ): Element[] | Selectors {
    if (this._wrapper.kind === 'text') {
      return selectorType ? new Selectors() : []
    }

    let percentage = 40
    let asSelectors = selectorType
    if (typeof percentageOrOptions === 'object' && percentageOrOptions !== null) {
      percentage = percentageOrOptions.percentage ?? 40
      asSelectors =
        percentageOrOptions.selectorType ?? percentageOrOptions.selector_type ?? selectorType
    } else if (typeof percentageOrOptions === 'number') {
      percentage = percentageOrOptions
    }

    let fingerprint: ElementFingerprint
    if (element instanceof Selector) {
      if (!element.rawNode) {
        return asSelectors ? new Selectors() : []
      }
      fingerprint = StorageTools.elementToDict(element.rawNode)
    } else if (isElementNode(element)) {
      fingerprint = StorageTools.elementToDict(element)
    } else {
      fingerprint = element as ElementFingerprint
    }

    const bestMatches = relocateHighestScoring(
      fingerprint,
      this._wrapper.element,
      percentage,
      this._pierceShadow,
    )
    if (bestMatches.length > 0) {
      return asSelectors ? this.convertElements(bestMatches) : bestMatches
    }

    return asSelectors ? new Selectors() : []
  }

  css(
    selector: string,
    variables: Record<string, string | number>,
  ): Selectors
  css(
    selector: string,
    identifierOrOptions?: string | AdaptiveQueryOptions,
    autoSave?: boolean,
    percentage?: number,
    variables?: Record<string, string | number>,
  ): Selectors
  css(
    selector: string,
    identifierOrOptions: string | AdaptiveQueryOptions | Record<string, string | number> = '',
    autoSave?: boolean,
    percentage = 40,
    variables?: Record<string, string | number>,
  ): Selectors {
    if (this._wrapper.kind === 'text') {
      return new Selectors()
    }

    const settings = resolveCssQuerySettings(
      identifierOrOptions,
      autoSave,
      percentage,
      variables,
      { autoSave: true },
    )
    const interpolatedSelector = interpolateCssSelector(selector, settings.variables)
    const contextRoots = collectQueryContextRoots(
      this._wrapper.element,
      this._pierceShadow,
    )

    const branches = interpolatedSelector.includes(',')
      ? splitCssSelectors(interpolatedSelector)
      : [interpolatedSelector]

    if (branches.length <= 1) {
      return this.runCssQuery(
        interpolatedSelector,
        settings,
        this._wrapper.element,
        contextRoots,
      )
    }
    const combinedResults = new Selectors()
    let sawDirectMatch = false

    for (const singleSelector of branches) {
      const branchResults = this.convertElements(
        this.collectCssMatches(singleSelector, this._wrapper.element, contextRoots),
      )
      if (branchResults.length === 0) continue
      sawDirectMatch = true
      if (settings.autoSave) {
        const target = branchResults[0]?.rawNode ?? null
        if (target) {
          // With an explicit identifier all branches share one fingerprint;
          // keep the first match instead of letting later branches overwrite it.
          if (settings.identifier) {
            if (combinedResults.length === 0) {
              this.save(target, settings.identifier)
            }
          } else {
            this.save(target, singleSelector)
          }
        }
      }
      combinedResults.push(...branchResults)
    }

    if (sawDirectMatch) {
      const seen = new Set<Element>()
      const deduped = new Selectors()
      for (const item of combinedResults) {
        const node = item.rawNode
        if (node && seen.has(node)) continue
        if (node) seen.add(node)
        deduped.push(item)
      }
      if (deduped.length > 1) {
        deduped.sort((a, b) => {
          const nodeA = a.rawNode
          const nodeB = b.rawNode
          if (!nodeA || !nodeB || nodeA === nodeB) return 0
          const pos = nodeA.compareDocumentPosition(nodeB)
          return pos & 4 ? -1 : pos & 2 ? 1 : 0
        })
      }
      return deduped
    }

    return this.finalizeQuery(
      [],
      settings,
      branches[0] ?? interpolatedSelector,
    )
  }

  private collectCssMatches(
    cssSelector: string,
    rootElement: Element,
    contextRoots: readonly Element[],
  ): Array<Element | InternalNodeWrapper> {
    const typePosition = extractTypePositionFilters(cssSelector)
    const executableSelector = typePosition ? typePosition.selector : cssSelector
    const xpathSelector = cssToXpath(executableSelector)
    const nativeMatches = tryNativeCssQuery(rootElement, executableSelector, contextRoots)
    if (nativeMatches) {
      return typePosition
        ? filterByTypePosition(
            nativeMatches,
            typePosition.filters,
            typePosition.nativeVerifySelector,
          )
        : nativeMatches
    }

    const matchedWrappers = runXPathQuery(
      rootElement,
      xpathSelector,
      this._pierceShadow,
      executableSelector,
      this._dom,
      contextRoots,
    )
    return typePosition
      ? filterByTypePosition(
          matchedWrappers,
          typePosition.filters,
          typePosition.nativeVerifySelector,
        )
      : matchedWrappers
  }

  private runCssQuery(
    cssSelector: string,
    settings: CssQuerySettings,
    rootElement: Element,
    contextRoots: readonly Element[],
  ): Selectors {
    return this.finalizeQuery(
      this.collectCssMatches(cssSelector, rootElement, contextRoots),
      settings,
      cssSelector,
    )
  }

  /** @internal Direct query without auto-save or relocation. */
  _queryDirect(
    selector: string,
    mode: 'css' | 'xpath' = 'css',
    options?: { variables?: Record<string, string | number | boolean> },
  ): Selectors {
    if (this._wrapper.kind === 'text') {
      return new Selectors()
    }
    const variables = options?.variables ?? {}
    if (mode === 'xpath') {
      const resolvedXpath = interpolateXPathSelector(
        selector,
        variables as Record<string, string | number>,
      )
      const matchedWrappers = runXPathQuery(
        this._wrapper.element,
        resolvedXpath,
        this._pierceShadow,
        selector,
        this._dom,
      )
      return this.convertElements(matchedWrappers)
    }

    const interpolatedSelector = interpolateCssSelector(
      selector,
      variables as Record<string, string | number>,
    )
    const contextRoots = collectQueryContextRoots(
      this._wrapper.element,
      this._pierceShadow,
    )
    const branches = interpolatedSelector.includes(',')
      ? splitCssSelectors(interpolatedSelector)
      : [interpolatedSelector]
    const matches: Array<Element | InternalNodeWrapper> = []
    const seen = new Set<Element>()
    for (const branch of branches) {
      for (const match of this.collectCssMatches(branch, this._wrapper.element, contextRoots)) {
        const node =
          'kind' in match ? (match.kind === 'element' ? match.element : null) : match
        if (node) {
          if (seen.has(node)) continue
          seen.add(node)
        }
        matches.push(match)
      }
    }
    return this.convertElements(matches)
  }

  private finalizeQuery(
    matchedWrappers: Array<Element | InternalNodeWrapper>,
    settings: {
      identifier: string
      autoSave: boolean
      percentage: number
    },
    fallbackIdentifier: string,
  ): Selectors {
    const identifier = settings.identifier || fallbackIdentifier

    if (matchedWrappers.length > 0) {
      if (settings.autoSave) {
        const firstItem = matchedWrappers[0]
        let targetEl: Element | null | undefined
        if ('kind' in firstItem) {
          targetEl = firstItem.kind === 'element' ? firstItem.element : firstItem.parentElement
        } else {
          targetEl = firstItem
        }
        if (targetEl) {
          this.save(targetEl, identifier)
        }
      }
      return this.convertElements(matchedWrappers)
    }

    const elementData = this.retrieve(identifier)
    if (elementData) {
      const relocatedElements = this.relocate(
        elementData,
        settings.percentage,
        false,
      )
      if (relocatedElements.length > 0 && settings.autoSave) {
        this.save(relocatedElements[0], identifier)
      }
      return this.convertElements(relocatedElements)
    }

    return new Selectors()
  }

  xpath(
    selector: string,
    variables: Record<string, string | number>,
  ): Selectors
  xpath(
    selector: string,
    identifierOrOptions?: string | AdaptiveQueryOptions,
    autoSave?: boolean,
    percentage?: number,
    variables?: Record<string, string | number>,
  ): Selectors
  xpath(
    selector: string,
    identifierOrOptions: string | AdaptiveQueryOptions | Record<string, string | number> = '',
    autoSave?: boolean,
    percentage = 40,
    variables?: Record<string, string | number>,
  ): Selectors {
    if (this._wrapper.kind === 'text') {
      return new Selectors()
    }

    const settings = resolveXPathQuerySettings(
      identifierOrOptions,
      autoSave,
      percentage,
      variables,
      { autoSave: true },
    )
    const resolvedXpath = interpolateXPathSelector(selector, settings.variables)
    const matchedWrappers = runXPathQuery(
      this._wrapper.element,
      resolvedXpath,
      this._pierceShadow,
      selector,
      this._dom,
    )
    return this.finalizeQuery(matchedWrappers, settings, selector)
  }

  findAll(...args: unknown[]): Selectors {
    if (this._wrapper.kind === 'text') {
      return new Selectors()
    }
    const { selectors, patterns, functions } = parseFindAllArguments(args)

    let results: Selectors
    if (selectors.length > 0) {
      results = this._queryDirect(selectors.join(', '))
    } else {
      results = this.belowElements
    }

    if (results.length > 0) {
      for (const pattern of patterns) {
        results = results.filter((e) =>
          Boolean(e.text.re(pattern, { checkMatch: true })),
        )
      }
      for (const fn of functions) {
        results = results.filter(fn)
      }
    }

    return results
  }

  find_all(...args: unknown[]): Selectors {
    return this.findAll(...args)
  }

  find(...args: unknown[]): Selector | null {
    const all = this.findAll(...args)
    return all.length > 0 ? all[0] : null
  }

  save(element: Selector | Element, identifier: string): void {
    if (!this._storage) {
      return
    }
    let targetElement: Element | null = null
    if (element instanceof Selector) {
      if (element._wrapper.kind === 'text') {
        targetElement = element._wrapper.parentElement ?? null
      } else {
        targetElement = element.rawNode
      }
    } else if (isElementNode(element)) {
      targetElement = element
    }
    if (targetElement) {
      this._storage.save(targetElement, identifier)
    }
  }

  retrieve(identifier: string): ElementFingerprint | null {
    if (!this._storage) {
      return null
    }
    const res = this._storage.retrieve(identifier)
    if (res && typeof (res as Promise<unknown>).then === 'function') {
      if (typeof (res as Promise<unknown>).catch === 'function') {
        (res as Promise<unknown>).catch(() => {})
      }
      throw new Error(
        `Storage returned an unhydrated Promise for identifier "${identifier}" during synchronous retrieval. Call "await storage.hydrate()" or use synchronous storage before querying.`,
      )
    }
    return res as ElementFingerprint | null
  }

  json<T = Record<string, unknown>>(): T {
    if (this._wrapper.kind === 'text') {
      return new TextHandler(this._wrapper.textValue).json<T>()
    }
    if (this._rawBody) {
      if (typeof this._rawBody === 'string') {
        try {
          return new TextHandler(this._rawBody).json<T>()
        } catch {}
      } else if (this._rawBody instanceof Uint8Array) {
        try {
          return new TextHandler(new TextDecoder(this.encoding).decode(this._rawBody)).json<T>()
        } catch {}
      }
    }
    if (this.text.toString().trim()) {
      return this.text.json<T>()
    }
    return this.getAllText({ strip: true }).json<T>()
  }

  re(
    regex: string | RegExp,
    optionsOrReplaceEntities?: RegexExtractOptions | boolean,
    cleanMatch = false,
    caseSensitive = true,
  ): TextHandlers {
    if (typeof optionsOrReplaceEntities === 'boolean') {
      return this.text.re(
        regex,
        optionsOrReplaceEntities,
        cleanMatch,
        caseSensitive,
        false,
      )
    }
    return this.text.re(
      regex,
      optionsOrReplaceEntities,
      cleanMatch,
      caseSensitive,
      false,
    )
  }

  reFirst<T = null>(
    regex: string | RegExp,
    defaultValue: T = null as unknown as T,
    optionsOrReplaceEntities?: RegexExtractOptions | boolean,
    cleanMatch = false,
    caseSensitive = true,
  ): TextHandler | T {
    return this.text.reFirst(
      regex,
      defaultValue,
      optionsOrReplaceEntities,
      cleanMatch,
      caseSensitive,
    )
  }

  re_first<T = null>(
    regex: string | RegExp,
    defaultValue: T = null as unknown as T,
    optionsOrReplaceEntities?: RegexExtractOptions | boolean,
    cleanMatch = false,
    caseSensitive = true,
  ): TextHandler | T {
    return this.reFirst(regex, defaultValue, optionsOrReplaceEntities, cleanMatch, caseSensitive)
  }

  findSimilar(
    similarityThresholdOrOptions: number | FindSimilarOptions = 0.2,
    ignoreAttributes: readonly string[] = ['href', 'src'],
    matchText = false,
  ): Selectors {
    if (this._wrapper.kind === 'text') {
      return new Selectors()
    }

    return this.convertElements(
      findSimilarElements(
        this._wrapper.element,
        similarityThresholdOrOptions,
        ignoreAttributes,
        matchText,
        this._dom,
      ),
    )
  }

  find_similar(
    similarityThresholdOrOptions: number | FindSimilarOptions = 0.2,
    ignoreAttributes: readonly string[] = ['href', 'src'],
    matchText = false,
  ): Selectors {
    return this.findSimilar(similarityThresholdOrOptions, ignoreAttributes, matchText)
  }

  findByText(
    text: string,
    firstMatchOrOptions?: true | (FindByTextOptions & { firstMatch?: true; first_match?: true }),
    partial?: boolean,
    caseSensitive?: boolean,
    cleanMatch?: boolean,
  ): Selector | null
  findByText(
    text: string,
    firstMatchOrOptions: false | (FindByTextOptions & { firstMatch: false }) | (FindByTextOptions & { first_match: false }),
    partial?: boolean,
    caseSensitive?: boolean,
    cleanMatch?: boolean,
  ): Selectors
  findByText(
    text: string,
    firstMatchOrOptions: boolean | FindByTextOptions = true,
    partial = false,
    caseSensitive = false,
    cleanMatch = true,
  ): Selector | Selectors | null {
    if (this._wrapper.kind === 'text') {
      return new Selectors()
    }

    const firstMatch =
      typeof firstMatchOrOptions === 'boolean'
        ? firstMatchOrOptions
        : (firstMatchOrOptions.firstMatch ?? firstMatchOrOptions.first_match ?? true)
    const results = this.convertElements(
      findElementsByText(
        this._wrapper.element,
        this._pierceShadow,
        text,
        firstMatchOrOptions,
        partial,
        caseSensitive,
        cleanMatch,
      ),
    )

    if (firstMatch) {
      return results.length > 0 ? results[0] : null
    }
    return results
  }

  find_by_text(
    text: string,
    firstMatchOrOptions: boolean | FindByTextOptions = true,
    partial = false,
    caseSensitive = false,
    cleanMatch = true,
  ): Selector | Selectors | null {
    if (firstMatchOrOptions === false) {
      return this.findByText(text, false, partial, caseSensitive, cleanMatch)
    }
    if (firstMatchOrOptions === true) {
      return this.findByText(text, true, partial, caseSensitive, cleanMatch)
    }
    const fn = this.findByText as (
      t: string,
      o: boolean | FindByTextOptions,
      p?: boolean,
      cs?: boolean,
      cm?: boolean,
    ) => Selector | Selectors | null
    return fn.call(this, text, firstMatchOrOptions, partial, caseSensitive, cleanMatch)
  }

  findByRegex(
    query: string | RegExp,
    firstMatchOrOptions?: true | (FindByRegexOptions & { firstMatch?: true; first_match?: true }),
    caseSensitive?: boolean,
    cleanMatch?: boolean,
  ): Selector | null
  findByRegex(
    query: string | RegExp,
    firstMatchOrOptions: false | (FindByRegexOptions & { firstMatch: false }) | (FindByRegexOptions & { first_match: false }),
    caseSensitive?: boolean,
    cleanMatch?: boolean,
  ): Selectors
  findByRegex(
    query: string | RegExp,
    firstMatchOrOptions: boolean | FindByRegexOptions = true,
    caseSensitive = false,
    cleanMatch = true,
  ): Selector | Selectors | null {
    if (this._wrapper.kind === 'text') {
      return new Selectors()
    }

    const firstMatch =
      typeof firstMatchOrOptions === 'boolean'
        ? firstMatchOrOptions
        : (firstMatchOrOptions.firstMatch ?? firstMatchOrOptions.first_match ?? true)
    const results = this.convertElements(
      findElementsByRegex(
        this._wrapper.element,
        this._pierceShadow,
        query,
        firstMatchOrOptions,
        caseSensitive,
        cleanMatch,
      ),
    )

    if (firstMatch) {
      return results.length > 0 ? results[0] : null
    }
    return results
  }

  find_by_regex(
    query: string | RegExp,
    firstMatchOrOptions: boolean | FindByRegexOptions = true,
    caseSensitive = false,
    cleanMatch = true,
  ): Selector | Selectors | null {
    if (firstMatchOrOptions === false) {
      return this.findByRegex(query, false, caseSensitive, cleanMatch)
    }
    if (firstMatchOrOptions === true) {
      return this.findByRegex(query, true, caseSensitive, cleanMatch)
    }
    const fn = this.findByRegex as (
      q: string | RegExp,
      o: boolean | FindByRegexOptions,
      cs?: boolean,
      cm?: boolean,
    ) => Selector | Selectors | null
    return fn.call(this, query, firstMatchOrOptions, caseSensitive, cleanMatch)
  }
}

export const Adaptor = Selector
