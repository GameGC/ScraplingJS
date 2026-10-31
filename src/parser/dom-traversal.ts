import type { GetAllTextOptions, RegexExtractOptions } from '../types'
import { isElementNode } from '../core/dom-utils'
import { collectDeepElements, getDeepParentElement } from '../core/shadow-dom'
import { getElementDirectText } from '../core/storage-tools'
import { cleanText, flatten, replaceEntities } from '../core/text-utils'
import { formatPrettyHtml } from './html-loader'

export type RootTarget = Element | Document | { readonly root: Element }

export function unwrapRootElement(target: RootTarget): Element {
  if ('root' in target && isElementNode(target.root)) {
    return target.root
  }
  if ((target as Node).nodeType === 9) {
    const doc = target as Document
    return doc.documentElement ?? doc.body
  }
  return target as Element
}

export function getParent(element: Element, pierceShadow = true): Element | null {
  return (pierceShadow ? getDeepParentElement(element) : element.parentElement) ?? null
}

export function getChildElements(element: Element, pierceShadow = true): Element[] {
  const children = Array.from(element.children)
  if (pierceShadow && element.shadowRoot) {
    children.push(...Array.from(element.shadowRoot.children))
  }
  return children
}

export const getChildren = getChildElements

export function getSiblings(element: Element, pierceShadow = true): Element[] {
  const parent = getParent(element, pierceShadow)
  if (!parent) return []
  return getChildElements(parent, pierceShadow).filter((child) => child !== element)
}

export function getNextSibling(element: Element): Element | null {
  return element.nextElementSibling
}

export function getPreviousSibling(element: Element): Element | null {
  return element.previousElementSibling
}

export function getAncestorElements(
  element: Element,
  pierceShadow = true,
): Element[] {
  const ancestors: Element[] = []
  let current = pierceShadow
    ? getDeepParentElement(element)
    : element.parentElement
  while (current) {
    ancestors.push(current)
    current = pierceShadow ? getDeepParentElement(current) : current.parentElement
  }
  return ancestors
}

export const getAncestors = getAncestorElements
export const getPath = getAncestorElements

export function findAncestor(
  element: Element,
  predicate: (ancestor: Element) => unknown,
  pierceShadow = true,
): Element | null {
  for (const ancestor of getAncestorElements(element, pierceShadow)) {
    const res = predicate(ancestor)
    if (Array.isArray(res) ? res.length > 0 : Boolean(res)) {
      return ancestor
    }
  }
  return null
}

export function getBelowElements(element: Element, pierceShadow = true): Element[] {
  return collectDeepElements(element, pierceShadow, false)
}

export function collectAllText(
  root: Element,
  pierceShadow = true,
  separatorOrOptions: string | GetAllTextOptions = '\n',
  strip = false,
  ignoreTags: readonly string[] = ['script', 'style'],
  validValues = true,
): string {
  const isOptions = typeof separatorOrOptions === 'object' && separatorOrOptions !== null
  const separator = isOptions ? (separatorOrOptions.separator ?? '\n') : separatorOrOptions
  const shouldStrip = isOptions ? (separatorOrOptions.strip ?? false) : strip
  const ignoredTagsList = isOptions
    ? (separatorOrOptions.ignoreTags ?? separatorOrOptions.ignore_tags ?? ['script', 'style'])
    : ignoreTags
  const onlyValidValues = isOptions
    ? (separatorOrOptions.validValues ?? separatorOrOptions.valid_values ?? true)
    : validValues

  const ignoredTagSet = new Set(ignoredTagsList.map((t) => t.toLowerCase()))
  const allStrings: string[] = []

  function collectTexts(node: Node): void {
    if (node.nodeType === 1) {
      const el = node as Element
      if (ignoredTagSet.has(el.tagName.toLowerCase())) {
        return
      }
      if (pierceShadow && el.shadowRoot) {
        for (let i = 0; i < el.shadowRoot.childNodes.length; i++) {
          collectTexts(el.shadowRoot.childNodes[i])
        }
      }
    } else if (node.nodeType === 3) {
      const rawText = node.nodeValue ?? ''
      if (rawText) {
        const processed = shouldStrip ? rawText.trim() : rawText
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

  collectTexts(root)
  return allStrings.join(separator)
}

export function getAllText(
  target: RootTarget,
  separatorOrOptions: string | GetAllTextOptions = '\n',
  strip = false,
  ignoreTags: readonly string[] = ['script', 'style'],
  validValues = true,
  pierceShadow = true,
): string {
  return collectAllText(
    unwrapRootElement(target),
    pierceShadow,
    separatorOrOptions,
    strip,
    ignoreTags,
    validValues,
  )
}

export const getDirectText = getElementDirectText

function normalizeRegexOptions(
  optionsOrReplaceEntities?: RegexExtractOptions | boolean,
  cleanMatch = false,
  caseSensitive = true,
  checkMatch = false,
): {
  replaceEntities: boolean
  cleanMatch: boolean
  caseSensitive: boolean
  checkMatch: boolean
} {
  if (typeof optionsOrReplaceEntities === 'object' && optionsOrReplaceEntities !== null) {
    return {
      replaceEntities:
        optionsOrReplaceEntities.replaceEntities ??
        optionsOrReplaceEntities.replace_entities ??
        true,
      cleanMatch:
        optionsOrReplaceEntities.cleanMatch ??
        optionsOrReplaceEntities.clean_match ??
        false,
      caseSensitive:
        optionsOrReplaceEntities.caseSensitive ??
        optionsOrReplaceEntities.case_sensitive ??
        true,
      checkMatch:
        optionsOrReplaceEntities.checkMatch ??
        optionsOrReplaceEntities.check_match ??
        false,
    }
  }
  return {
    replaceEntities: optionsOrReplaceEntities ?? true,
    cleanMatch,
    caseSensitive,
    checkMatch,
  }
}

function targetToString(item: Element | string): string {
  if (typeof item === 'string') return item
  const direct = getElementDirectText(item)
  return direct.trim() ? direct : (item.textContent ?? '')
}

function runRegexSingle(
  rawText: string,
  regex: string | RegExp,
  opts: {
    replaceEntities: boolean
    cleanMatch: boolean
    caseSensitive: boolean
    checkMatch: boolean
  },
): string[] | boolean {
  const source = typeof regex === 'string' ? regex : regex.source
  let flags = 'gu'
  if (!opts.caseSensitive || (typeof regex !== 'string' && regex.ignoreCase)) {
    flags += 'i'
  }
  if (typeof regex !== 'string') {
    if (regex.multiline && !flags.includes('m')) flags += 'm'
    if (regex.dotAll && !flags.includes('s')) flags += 's'
  }
  const compiled = new RegExp(source, flags)
  const inputText = opts.cleanMatch ? cleanText(rawText) : rawText

  if (opts.checkMatch) {
    return compiled.test(inputText)
  }

  const rawMatches = Array.from(inputText.matchAll(compiled))
  if (rawMatches.length === 0) {
    return []
  }

  const extracted: string[] = []
  for (const match of rawMatches) {
    if (match.length > 1) {
      for (let i = 1; i < match.length; i++) {
        extracted.push(match[i] ?? '')
      }
    } else {
      extracted.push(match[0] ?? '')
    }
  }

  return opts.replaceEntities ? extracted.map(replaceEntities) : extracted
}

export function matchRegex(
  target: Element | string,
  regex: string | RegExp,
  options?: { cleanMatch?: boolean; caseSensitive?: boolean },
): boolean {
  return runRegexSingle(targetToString(target), regex, {
    replaceEntities: true,
    cleanMatch: options?.cleanMatch ?? false,
    caseSensitive: options?.caseSensitive ?? true,
    checkMatch: true,
  }) as boolean
}

export function re(
  target: Element | string | Iterable<Element | string>,
  regex: string | RegExp,
  optionsOrReplaceEntities?: RegexExtractOptions | boolean,
  cleanMatch = false,
  caseSensitive = true,
): string[] {
  const opts = normalizeRegexOptions(
    optionsOrReplaceEntities,
    cleanMatch,
    caseSensitive,
    false,
  )
  if (typeof target === 'string' || isElementNode(target)) {
    return runRegexSingle(targetToString(target), regex, opts) as string[]
  }
  const nested: string[][] = []
  for (const item of target) {
    nested.push(runRegexSingle(targetToString(item), regex, opts) as string[])
  }
  return flatten(nested)
}

export function reFirst<T = null>(
  target: Element | string | Iterable<Element | string>,
  regex: string | RegExp,
  defaultValue: T = null as unknown as T,
  optionsOrReplaceEntities?: RegexExtractOptions | boolean,
  cleanMatch = false,
  caseSensitive = true,
): string | T {
  if (
    typeof defaultValue === 'object' &&
    defaultValue !== null &&
    optionsOrReplaceEntities === undefined &&
    ('default' in defaultValue ||
      'replaceEntities' in defaultValue ||
      'replace_entities' in defaultValue ||
      'cleanMatch' in defaultValue ||
      'clean_match' in defaultValue ||
      'caseSensitive' in defaultValue ||
      'case_sensitive' in defaultValue)
  ) {
    const optObj = defaultValue as RegexExtractOptions & { default?: T }
    const fallback = ('default' in optObj ? optObj.default : null) as T
    const matches = re(target, regex, optObj)
    return matches.length > 0 ? matches[0] : fallback
  }
  const matches = re(target, regex, optionsOrReplaceEntities, cleanMatch, caseSensitive)
  return matches.length > 0 ? matches[0] : defaultValue
}

export function extractJson<T = Record<string, unknown>>(
  target: RootTarget | string,
): T {
  if (typeof target === 'string') {
    return JSON.parse(target) as T
  }
  const el = unwrapRootElement(target)
  const direct = getElementDirectText(el).trim()
  if (direct) {
    try {
      return JSON.parse(direct) as T
    } catch {}
  }
  return JSON.parse(collectAllText(el, true, '\n', true)) as T
}

export function getAttributes(element: Element): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 0; i < element.attributes.length; i++) {
    const attr = element.attributes.item(i)
    if (attr) {
      out[attr.name] = attr.value
    }
  }
  return out
}

export function searchAttributes(
  element: Element,
  keyword: string,
  partialOrOptions: boolean | { partial?: boolean } = false,
): Record<string, string> {
  const partial =
    typeof partialOrOptions === 'object' && partialOrOptions !== null
      ? Boolean(partialOrOptions.partial)
      : Boolean(partialOrOptions)
  const out: Record<string, string> = {}
  for (let i = 0; i < element.attributes.length; i++) {
    const attr = element.attributes.item(i)
    if (!attr) continue
    if (partial ? attr.value.includes(keyword) : attr.value === keyword) {
      out[attr.name] = attr.value
    }
  }
  return out
}

export function hasClass(element: Element, className: string): boolean {
  return element.classList.contains(className)
}

export function prettifyHtml(target: RootTarget): string {
  return formatPrettyHtml(unwrapRootElement(target))
}

export function urljoin(
  baseUrlOrPage: string | { readonly url: string },
  relativeUrl: string,
): string {
  const base = typeof baseUrlOrPage === 'string' ? baseUrlOrPage : baseUrlOrPage.url
  if (!base) return relativeUrl
  try {
    return new URL(relativeUrl, base).toString()
  } catch {
    return relativeUrl
  }
}
