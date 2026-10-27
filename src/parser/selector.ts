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
  SelectorSyntaxError,
  TextHandler,
  TextHandlers,
} from '../core/custom-types'
import { generateElementSelector } from '../core/mixins'
import { areElementsAlike, calculateSimilarityScore } from '../core/similarity'
import { StorageTools, getElementDirectText } from '../core/storage-tools'
import { cssToXpath, splitCssSelectors, xpathLiteral } from '../core/translator'
import { cleanSpaces, escapeCssString, escapeRegExpChars } from '../core/utils'
import {
  collectDeepElements,
  collectDeepShadowRoots,
  getDeepParentElement,
} from '../snapshot/shadow-dom'
import { AutoStorageSystem, MemoryStorageSystem, StorageSystemMixin } from '../storage'
import { Selectors } from './selectors'

const WHITELISTED_ATTRS: Record<string, string> = {
  class_: 'class',
  for_: 'for',
}

function removeCommentsFromNode(root: Node): void {
  const doc = root.ownerDocument ?? (root as Document)
  if (!doc || typeof doc.createTreeWalker !== 'function') return
  const walker = doc.createTreeWalker(root, 128)
  const comments: Comment[] = []
  let current = walker.nextNode()
  while (current) {
    comments.push(current as Comment)
    current = walker.nextNode()
  }
  for (const comment of comments) {
    comment.parentNode?.removeChild(comment)
  }
}

function normalizeTextNodes(root: Node): void {
  root.normalize()
}

function parseHtmlToElement(
  htmlContent: string,
  keepComments: boolean,
): { rootElement: Element; document: Document } {
  const cleaned = htmlContent.trim().replace(/\x00/g, '') || '<html/>'
  const parser = new DOMParser()
  const doc = parser.parseFromString(cleaned, 'text/html')
  if (!keepComments) {
    removeCommentsFromNode(doc)
    normalizeTextNodes(doc)
  }
  return {
    rootElement: doc.documentElement,
    document: doc,
  }
}

function formatPrettyHtml(node: Element, indent = 0): string {
  const pad = '  '.repeat(indent)
  const tag = node.tagName.toLowerCase()
  let attrs = ''
  for (let i = 0; i < node.attributes.length; i++) {
    const a = node.attributes.item(i)
    if (a) {
      attrs += ` ${a.name}="${a.value.replace(/"/g, '&quot;')}"`
    }
  }
  if (node.children.length === 0) {
    const text = node.textContent ?? ''
    return `${pad}<${tag}${attrs}>${text}</${tag}>`
  }
  const childLines: string[] = []
  for (let i = 0; i < node.childNodes.length; i++) {
    const child = node.childNodes[i]
    if (child.nodeType === 1) {
      childLines.push(formatPrettyHtml(child as Element, indent + 1))
    } else if (child.nodeType === 3) {
      const t = (child.nodeValue ?? '').trim()
      if (t) {
        childLines.push(`${'  '.repeat(indent + 1)}${t}`)
      }
    }
  }
  return `${pad}<${tag}${attrs}>\n${childLines.join('\n')}\n${pad}</${tag}>`
}

export type InternalNodeWrapper =
  | { kind: 'element'; element: Element }
  | { kind: 'text'; textValue: string; parentElement?: Element | null }

export class Selector {
  readonly url: string
  readonly encoding: string
  private readonly _adaptiveEnabled: boolean
  private readonly _pierceShadow: boolean
  private readonly _keepComments: boolean
  private readonly _hugeTreeEnabled: boolean
  private readonly _rawBody: string | Uint8Array
  private readonly _wrapper: InternalNodeWrapper
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
    } else if (
      typeof Element !== 'undefined' &&
      (contentOrOptions instanceof Element ||
        (typeof Document !== 'undefined' && contentOrOptions instanceof Document) ||
        (typeof DocumentFragment !== 'undefined' &&
          contentOrOptions instanceof DocumentFragment))
    ) {
      opts = { ...options, root: contentOrOptions }
    } else if (contentOrOptions && typeof contentOrOptions === 'object') {
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
    this._hugeTreeEnabled = opts.hugeTree ?? opts.huge_tree ?? true
    this._keepComments = opts.keepComments ?? opts.keep_comments ?? false
    this._pierceShadow = opts.pierceShadow ?? opts.pierce_shadow ?? true
    this._rawBody = ''
    this._storage = null

    if (opts.root === undefined) {
      let htmlString: string
      if (typeof opts.content === 'string') {
        htmlString = opts.content
      } else if (opts.content instanceof Uint8Array) {
        htmlString = new TextDecoder(this.encoding).decode(opts.content).replace(/\x00/g, '')
      } else {
        throw new TypeError(`content argument must be str or bytes, got ${typeof opts.content}`)
      }
      const { rootElement } = parseHtmlToElement(htmlString, this._keepComments)
      this._wrapper = { kind: 'element', element: rootElement }
      this._rawBody = opts.content
    } else {
      const rootArg = opts.root
      if (
        rootArg &&
        typeof rootArg === 'object' &&
        'kind' in rootArg &&
        (rootArg.kind === 'text' || rootArg.kind === 'element')
      ) {
        this._wrapper = rootArg as InternalNodeWrapper
      } else if (typeof Document !== 'undefined' && rootArg instanceof Document) {
        if (!this._keepComments) {
          removeCommentsFromNode(rootArg)
          normalizeTextNodes(rootArg)
        }
        this._wrapper = { kind: 'element', element: rootArg.documentElement }
      } else if (
        typeof ShadowRoot !== 'undefined' &&
        rootArg instanceof ShadowRoot &&
        rootArg.host
      ) {
        this._wrapper = { kind: 'element', element: rootArg.host }
      } else if (typeof Element !== 'undefined' && rootArg instanceof Element) {
        this._wrapper = { kind: 'element', element: rootArg }
      } else if (rootArg && typeof (rootArg as Node).nodeType === 'number') {
        const node = rootArg as Node
        if (node.nodeType === 3) {
          this._wrapper = {
            kind: 'text',
            textValue: node.nodeValue ?? '',
            parentElement: getDeepParentElement(node),
          }
        } else if (node.nodeType === 2) {
          this._wrapper = {
            kind: 'text',
            textValue: (node as Attr).value ?? node.nodeValue ?? '',
            parentElement: (node as Attr).ownerElement ?? null,
          }
        } else if (node.nodeType === 9 && (node as Document).documentElement) {
          this._wrapper = { kind: 'element', element: (node as Document).documentElement }
        } else {
          this._wrapper = {
            kind: 'text',
            textValue: String(node.textContent ?? ''),
            parentElement: getDeepParentElement(node),
          }
        }
      } else {
        throw new TypeError('Invalid root node provided to Selector')
      }

      if (this._wrapper.kind === 'text') {
        this._adaptiveEnabled = false
        return this.createProxy()
      }
    }

    this._adaptiveEnabled = opts.adaptive !== undefined ? Boolean(opts.adaptive) : true

    if (this._adaptiveEnabled) {
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
    }

    return this.createProxy()
  }

  static fromDocument(
    doc: Document = document,
    options?: Omit<SelectorOptions, 'content' | 'root'>,
  ): Selector {
    return new Selector({
      adaptive: true,
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
      adaptive: true,
      pierceShadow: true,
      ...options,
      url: options?.url ?? element.ownerDocument?.location?.href ?? '',
      root: element,
    })
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
      adaptive: this._adaptiveEnabled,
      pierceShadow: this._pierceShadow,
      _storage: this._storage ?? undefined,
      keepComments: this._keepComments,
      hugeTree: this._hugeTreeEnabled,
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

  attr(name: string): TextHandler | undefined {
    if (this._wrapper.kind === 'text') {
      throw new TypeError('Text nodes do not have attributes')
    }
    return this.attrib.get(name, undefined)
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

    let separator = '\n'
    let strip = false
    let ignoredTagsList: readonly string[] = ['script', 'style']
    let onlyValidValues = true

    if (typeof separatorOrOptions === 'object' && separatorOrOptions !== null) {
      separator = separatorOrOptions.separator ?? '\n'
      strip = separatorOrOptions.strip ?? false
      ignoredTagsList =
        separatorOrOptions.ignoreTags ??
        separatorOrOptions.ignore_tags ??
        ['script', 'style']
      onlyValidValues =
        separatorOrOptions.validValues ?? separatorOrOptions.valid_values ?? true
    } else {
      separator = separatorOrOptions
      if (typeof stripOrOptions === 'object' && stripOrOptions !== null) {
        if (stripOrOptions.separator !== undefined) separator = stripOrOptions.separator
        strip = stripOrOptions.strip ?? false
        ignoredTagsList =
          stripOrOptions.ignoreTags ?? stripOrOptions.ignore_tags ?? ignoreTags
        onlyValidValues =
          stripOrOptions.validValues ?? stripOrOptions.valid_values ?? validValues
      } else {
        strip = stripOrOptions
        ignoredTagsList = ignoreTags
        onlyValidValues = validValues
      }
    }

    const rootEl = this._wrapper.element
    const ignoredTagSet = new Set(ignoredTagsList.map((t) => t.toLowerCase()))
    const allStrings: string[] = []
    const pierce = this._pierceShadow

    function collectTexts(node: Node): void {
      if (node.nodeType === 1) {
        const el = node as Element
        if (ignoredTagSet.has(el.tagName.toLowerCase())) {
          return
        }
        if (pierce && el.shadowRoot) {
          for (let i = 0; i < el.shadowRoot.childNodes.length; i++) {
            collectTexts(el.shadowRoot.childNodes[i])
          }
        }
      } else if (node.nodeType === 3) {
        const rawText = node.nodeValue ?? ''
        if (rawText) {
          const processed = strip ? rawText.trim() : rawText
          if (!onlyValidValues || processed.trim().length > 0) {
            allStrings.push(processed)
          }
        }
        return
      }

      for (let i = 0; i < node.childNodes.length; i++) {
        collectTexts(node.childNodes[i])
      }
    }

    collectTexts(rootEl)
    return new TextHandler(allStrings.join(separator))
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
    const el = this._wrapper.element
    const directChildren = Array.from(el.children)
    if (this._pierceShadow && el.shadowRoot) {
      directChildren.push(...Array.from(el.shadowRoot.children))
    }
    return this.convertElements(directChildren)
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
    let curr = this._pierceShadow
      ? getDeepParentElement(this._wrapper.element)
      : this._wrapper.element.parentElement
    while (curr) {
      yield this.convertElement(curr)
      curr = this._pierceShadow ? getDeepParentElement(curr) : curr.parentElement
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
    } else if (typeof Element !== 'undefined' && element instanceof Element) {
      fingerprint = StorageTools.elementToDict(element)
    } else {
      fingerprint = element as ElementFingerprint
    }

    const scoreTable = new Map<number, Element[]>()
    const rootEl = this._wrapper.element
    const candidates = collectDeepElements(rootEl, this._pierceShadow, false)

    for (const node of candidates) {
      const score = calculateSimilarityScore(fingerprint, node)
      let bucket = scoreTable.get(score)
      if (!bucket) {
        bucket = []
        scoreTable.set(score, bucket)
      }
      bucket.push(node)
    }

    if (scoreTable.size > 0) {
      const highestProbability = Math.max(...scoreTable.keys())
      const bestMatches = scoreTable.get(highestProbability) ?? []
      if (bestMatches.length > 0 && highestProbability >= percentage) {
        if (!asSelectors) {
          return bestMatches
        }
        return this.convertElements(bestMatches)
      }
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
    adaptive?: boolean,
    autoSave?: boolean,
    percentage?: number,
    variables?: Record<string, string | number>,
  ): Selectors
  css(
    selector: string,
    identifierOrOptions: string | AdaptiveQueryOptions | Record<string, string | number> = '',
    adaptive?: boolean,
    autoSave?: boolean,
    percentage = 40,
    variables?: Record<string, string | number>,
  ): Selectors {
    if (this._wrapper.kind === 'text') {
      return new Selectors()
    }

    let identifier = ''
    let isAdaptive = adaptive ?? this._adaptiveEnabled
    let isAutoSave = autoSave ?? this._adaptiveEnabled
    let minPercentage = percentage
    let cssVars: Record<string, string | number> = { ...(variables ?? {}) }

    if (typeof identifierOrOptions === 'object' && identifierOrOptions !== null) {
      const opts = identifierOrOptions as AdaptiveQueryOptions
      identifier = typeof opts.identifier === 'string' ? opts.identifier : ''
      isAdaptive = typeof opts.adaptive === 'boolean' ? opts.adaptive : (adaptive ?? this._adaptiveEnabled)
      isAutoSave =
        typeof opts.autoSave === 'boolean'
          ? opts.autoSave
          : typeof opts.auto_save === 'boolean'
            ? opts.auto_save
            : (autoSave ?? this._adaptiveEnabled)
      minPercentage = typeof opts.percentage === 'number' ? opts.percentage : 40
      if (opts.variables) {
        for (const [k, v] of Object.entries(opts.variables)) {
          if (typeof v === 'string' || typeof v === 'number') {
            cssVars[k] = v
          }
        }
      }
      const reserved = new Set([
        'identifier',
        'adaptive',
        'autoSave',
        'auto_save',
        'percentage',
        'variables',
      ])
      for (const [k, v] of Object.entries(identifierOrOptions)) {
        if (!reserved.has(k) && (typeof v === 'string' || typeof v === 'number')) {
          cssVars[k] = v
        }
      }
    } else {
      identifier = identifierOrOptions
    }

    let interpolatedSelector = selector
    for (const [varName, varVal] of Object.entries(cssVars)) {
      const valStr = escapeCssString(String(varVal))
      const quotedPattern = new RegExp(
        '([\'"])\\$' + escapeRegExpChars(varName) + '(?![a-zA-Z0-9_])\\1',
        'g',
      )
      interpolatedSelector = interpolatedSelector.replace(quotedPattern, () => `"${valStr}"`)
      const barePattern = new RegExp(
        '\\$' + escapeRegExpChars(varName) + '(?![a-zA-Z0-9_])',
        'g',
      )
      interpolatedSelector = interpolatedSelector.replace(barePattern, () => `"${valStr}"`)
    }

    if (!this._adaptiveEnabled || !interpolatedSelector.includes(',')) {
      const xpathSelector = cssToXpath(interpolatedSelector)
      return this.xpath(
        xpathSelector,
        identifier || interpolatedSelector,
        isAdaptive,
        isAutoSave,
        minPercentage,
        cssVars,
      )
    }

    const combinedResults = new Selectors()
    for (const singleSelector of splitCssSelectors(interpolatedSelector)) {
      const xpathSelector = cssToXpath(singleSelector)
      const partResults = this.xpath(
        xpathSelector,
        identifier || singleSelector,
        isAdaptive,
        isAutoSave,
        minPercentage,
        cssVars,
      )
      combinedResults.push(...partResults)
    }
    return combinedResults
  }

  xpath(
    selector: string,
    variables: Record<string, string | number>,
  ): Selectors
  xpath(
    selector: string,
    identifierOrOptions?: string | AdaptiveQueryOptions,
    adaptive?: boolean,
    autoSave?: boolean,
    percentage?: number,
    variables?: Record<string, string | number>,
  ): Selectors
  xpath(
    selector: string,
    identifierOrOptions: string | AdaptiveQueryOptions | Record<string, string | number> = '',
    adaptive?: boolean,
    autoSave?: boolean,
    percentage = 40,
    variables?: Record<string, string | number>,
  ): Selectors {
    if (this._wrapper.kind === 'text') {
      return new Selectors()
    }

    let identifier = ''
    let isAdaptive = adaptive ?? this._adaptiveEnabled
    let isAutoSave = autoSave ?? this._adaptiveEnabled
    let minPercentage = percentage
    let xpathVars: Record<string, string | number | boolean> = variables ?? {}

    if (typeof identifierOrOptions === 'object' && identifierOrOptions !== null) {
      const opts = identifierOrOptions as AdaptiveQueryOptions
      identifier = typeof opts.identifier === 'string' ? opts.identifier : ''
      isAdaptive = typeof opts.adaptive === 'boolean' ? opts.adaptive : (adaptive ?? this._adaptiveEnabled)
      isAutoSave =
        typeof opts.autoSave === 'boolean'
          ? opts.autoSave
          : typeof opts.auto_save === 'boolean'
            ? opts.auto_save
            : (autoSave ?? this._adaptiveEnabled)
      minPercentage = typeof opts.percentage === 'number' ? opts.percentage : 40
      const reserved = new Set([
        'identifier',
        'adaptive',
        'autoSave',
        'auto_save',
        'percentage',
        'variables',
      ])
      xpathVars = opts.variables ? { ...opts.variables } : {}
      for (const [k, v] of Object.entries(identifierOrOptions)) {
        if (!reserved.has(k)) {
          xpathVars[k] = v
        }
      }
    } else {
      identifier = identifierOrOptions
    }

    let resolvedXpath = selector
    for (const [varName, varVal] of Object.entries(xpathVars)) {
      const replacement =
        typeof varVal === 'number' || typeof varVal === 'boolean'
          ? String(varVal)
          : xpathLiteral(String(varVal))
      const pattern = new RegExp(
        '\\$' + escapeRegExpChars(varName) + '(?![a-zA-Z0-9_])',
        'g',
      )
      resolvedXpath = resolvedXpath.replace(pattern, () => replacement)
    }

    const rootEl = this._wrapper.element
    const doc = rootEl.ownerDocument ?? document
    const contextRoots: Element[] = [rootEl]

    if (this._pierceShadow) {
      const shadowRoots = collectDeepShadowRoots(rootEl)
      for (const sr of shadowRoots) {
        for (let i = 0; i < sr.children.length; i++) {
          const childEl = sr.children.item(i)
          if (childEl) {
            contextRoots.push(childEl)
          }
        }
      }
    }

    const matchedWrappers: Array<Element | InternalNodeWrapper> = []
    const seenNodes = new Set<Node>()

    const shadowRelativeXpath = resolvedXpath.startsWith('//')
      ? `.${resolvedXpath}`
      : resolvedXpath

    try {
      for (let ctxIdx = 0; ctxIdx < contextRoots.length; ctxIdx++) {
        const ctxRoot = contextRoots[ctxIdx]
        const exprToRun = ctxIdx === 0 ? resolvedXpath : shadowRelativeXpath
        const snapshot = doc.evaluate(exprToRun, ctxRoot, null, 7, null)
        for (let i = 0; i < snapshot.snapshotLength; i++) {
          const item = snapshot.snapshotItem(i)
          if (!item || seenNodes.has(item)) continue
          seenNodes.add(item)
          if (item.nodeType === 1) {
            matchedWrappers.push(item as Element)
          } else if (item.nodeType === 3) {
            matchedWrappers.push({
              kind: 'text',
              textValue: item.nodeValue ?? '',
              parentElement: getDeepParentElement(item),
            })
          } else if (item.nodeType === 2) {
            matchedWrappers.push({
              kind: 'text',
              textValue: (item as Attr).value ?? '',
              parentElement: (item as Attr).ownerElement,
            })
          }
        }
      }
    } catch {
      throw new SelectorSyntaxError(`Invalid XPath selector: ${selector}`)
    }

    if (matchedWrappers.length > 0) {
      if (this._adaptiveEnabled && isAutoSave) {
        const firstItem = matchedWrappers[0]
        let targetEl: Element | null | undefined
        if ('kind' in firstItem) {
          targetEl = firstItem.kind === 'element' ? firstItem.element : firstItem.parentElement
        } else {
          targetEl = firstItem
        }
        if (targetEl) {
          this.save(targetEl, identifier || selector)
        }
      }
      return this.convertElements(matchedWrappers)
    }

    if (this._adaptiveEnabled && isAdaptive) {
      const elementData = this.retrieve(identifier || selector)
      if (elementData) {
        const relocatedElements = this.relocate(elementData, minPercentage, false)
        if (relocatedElements.length > 0 && isAutoSave) {
          this.save(relocatedElements[0], identifier || selector)
        }
        return this.convertElements(relocatedElements)
      }
    }

    return new Selectors()
  }

  findAll(...args: unknown[]): Selectors {
    if (this._wrapper.kind === 'text') {
      return new Selectors()
    }
    if (args.length === 0) {
      throw new TypeError(
        'You have to pass something to search with, like tag name(s), tag attributes, or both.',
      )
    }

    const attributes: Record<string, string> = {}
    const tags = new Set<string>()
    const patterns: RegExp[] = []
    const functions: Array<(el: Selector) => boolean> = []
    const selectors: string[] = []

    for (let i = 0; i < args.length; i++) {
      const arg = args[i]
      if (typeof arg === 'string') {
        tags.add(arg)
      } else if (Array.isArray(arg) || arg instanceof Set) {
        const arr = Array.from(arg)
        if (!arr.every((x) => typeof x === 'string')) {
          throw new TypeError(
            'Nested Iterables are not accepted, only iterables of tag names are accepted',
          )
        }
        for (const t of arr) {
          tags.add(t)
        }
      } else if (arg instanceof RegExp) {
        patterns.push(arg)
      } else if (typeof arg === 'function') {
        functions.push(arg as (el: Selector) => boolean)
      } else if (arg && typeof arg === 'object') {
        const entries = Object.entries(arg)
        if (!entries.every(([k, v]) => typeof k === 'string' && typeof v === 'string')) {
          throw new TypeError(
            'Nested dictionaries are not accepted, only string keys and string values are accepted',
          )
        }
        for (const [k, v] of entries) {
          const mappedKey = WHITELISTED_ATTRS[k] ?? k
          attributes[mappedKey] = v as string
        }
      } else {
        throw new TypeError(
          `Argument with type "${typeof arg}" is not accepted, please read the docs.`,
        )
      }
    }

    const effectiveTags = tags.size > 0 ? tags : new Set(['*'])
    for (const tag of effectiveTags) {
      let sel = tag
      for (const [key, value] of Object.entries(attributes)) {
        if (!key) continue
        if (key === 'class') {
          const classNames = value.split(/\s+/).filter(Boolean)
          if (classNames.length > 0) {
            sel += classNames.map((name) => `[class~="${escapeCssString(name)}"]`).join('')
          } else {
            sel += `[class="${escapeCssString(value)}"]`
          }
        } else {
          const escapedKey =
            typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
              ? CSS.escape(key)
              : key.replace(/([^\w-])/g, '\\$1')
          sel += `[${escapedKey}="${escapeCssString(value)}"]`
        }
      }
      if (sel !== '*') {
        selectors.push(sel)
      }
    }

    let results: Selectors
    if (selectors.length > 0) {
      results = this.css(selectors.join(', '), { adaptive: false, autoSave: false })
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
    if (this._adaptiveEnabled && this._storage) {
      let targetElement: Element | null = null
      if (element instanceof Selector) {
        if (element._wrapper.kind === 'text') {
          targetElement = element._wrapper.parentElement ?? null
        } else {
          targetElement = element.rawNode
        }
      } else if (typeof Element !== 'undefined' && element instanceof Element) {
        targetElement = element
      }
      if (targetElement) {
        this._storage.save(targetElement, identifier)
      }
    } else {
      throw new Error(
        "Can't use `adaptive` features while it's disabled globally, you have to start a new class instance.",
      )
    }
  }

  retrieve(identifier: string): ElementFingerprint | null {
    if (this._adaptiveEnabled && this._storage) {
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
    throw new Error(
      "Can't use `adaptive` features while it's disabled globally, you have to start a new class instance.",
    )
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

    let threshold = 0.2
    let ignoredAttrs: readonly string[] = ['href', 'src']
    let shouldMatchText = false

    if (
      typeof similarityThresholdOrOptions === 'object' &&
      similarityThresholdOrOptions !== null
    ) {
      threshold =
        similarityThresholdOrOptions.similarityThreshold ??
        similarityThresholdOrOptions.similarity_threshold ??
        0.2
      ignoredAttrs =
        similarityThresholdOrOptions.ignoreAttributes ??
        similarityThresholdOrOptions.ignore_attributes ??
        ['href', 'src']
      shouldMatchText =
        similarityThresholdOrOptions.matchText ??
        similarityThresholdOrOptions.match_text ??
        false
    } else {
      threshold = similarityThresholdOrOptions
      ignoredAttrs = ignoreAttributes
      shouldMatchText = matchText
    }

    const rootEl = this._wrapper.element
    const currentDepth = Array.from(this.iterancestors()).length
    const ignoredSet = new Set(ignoredAttrs)
    const targetAttrs: Record<string, string> = {}
    for (let i = 0; i < rootEl.attributes.length; i++) {
      const attr = rootEl.attributes.item(i)
      if (attr && !ignoredSet.has(attr.name)) {
        targetAttrs[attr.name] = attr.value
      }
    }

    const pathParts = [this.tag]
    const parentEl = getDeepParentElement(rootEl)
    if (parentEl) {
      pathParts.unshift(parentEl.tagName.toLowerCase())
      const grandParentEl = getDeepParentElement(parentEl)
      if (grandParentEl) {
        pathParts.unshift(grandParentEl.tagName.toLowerCase())
      }
    }

    const xpathPath = `//${pathParts.join('/')}[count(ancestor::*) = ${currentDepth}]`
    const doc = rootEl.ownerDocument ?? document
    const snapshot = doc.evaluate(xpathPath, rootEl, null, 7, null)
    const similarElements: Element[] = []

    for (let i = 0; i < snapshot.snapshotLength; i++) {
      const candidate = snapshot.snapshotItem(i) as Element | null
      if (
        candidate &&
        candidate !== rootEl &&
        areElementsAlike(
          rootEl,
          targetAttrs,
          candidate,
          ignoredAttrs,
          threshold,
          shouldMatchText,
        )
      ) {
        similarElements.push(candidate)
      }
    }

    return this.convertElements(similarElements)
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

    let firstMatch = true
    let isPartial = partial
    let isCaseSensitive = caseSensitive
    let isCleanMatch = cleanMatch

    if (typeof firstMatchOrOptions === 'object' && firstMatchOrOptions !== null) {
      firstMatch = firstMatchOrOptions.firstMatch ?? firstMatchOrOptions.first_match ?? true
      isPartial = firstMatchOrOptions.partial ?? false
      isCaseSensitive =
        firstMatchOrOptions.caseSensitive ?? firstMatchOrOptions.case_sensitive ?? false
      isCleanMatch =
        firstMatchOrOptions.cleanMatch ?? firstMatchOrOptions.clean_match ?? true
    } else {
      firstMatch = firstMatchOrOptions
    }

    const queryText = isCaseSensitive ? text : text.toLowerCase()
    const results = new Selectors()
    const descendants = collectDeepElements(
      this._wrapper.element,
      this._pierceShadow,
      false,
    )

    for (let i = 0; i < descendants.length; i++) {
      const el = descendants[i]
      const directText = getElementDirectText(el)
      if (!directText || !directText.trim()) continue

      const nodeSel = this.convertElement(el)
      let nodeText = nodeSel.text.toString()
      if (isCleanMatch) {
        nodeText = nodeSel.text.clean().toString()
      }
      if (!isCaseSensitive) {
        nodeText = nodeText.toLowerCase()
      }

      if (isPartial ? nodeText.includes(queryText) : nodeText === queryText) {
        results.push(nodeSel)
        if (firstMatch) {
          return results[0]
        }
      }
    }

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

    let firstMatch = true
    let isCaseSensitive = caseSensitive
    let isCleanMatch = cleanMatch

    if (typeof firstMatchOrOptions === 'object' && firstMatchOrOptions !== null) {
      firstMatch = firstMatchOrOptions.firstMatch ?? firstMatchOrOptions.first_match ?? true
      isCaseSensitive =
        firstMatchOrOptions.caseSensitive ?? firstMatchOrOptions.case_sensitive ?? false
      isCleanMatch =
        firstMatchOrOptions.cleanMatch ?? firstMatchOrOptions.clean_match ?? true
    } else {
      firstMatch = firstMatchOrOptions
    }

    const results = new Selectors()
    const descendants = collectDeepElements(
      this._wrapper.element,
      this._pierceShadow,
      false,
    )

    for (let i = 0; i < descendants.length; i++) {
      const el = descendants[i]
      const directText = getElementDirectText(el)
      if (!directText || !directText.trim()) continue

      const nodeSel = this.convertElement(el)
      const matched = nodeSel.text.re(query, {
        checkMatch: true,
        cleanMatch: isCleanMatch,
        caseSensitive: isCaseSensitive,
      })
      if (matched) {
        results.push(nodeSel)
        if (firstMatch) {
          return results[0]
        }
      }
    }

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
