import type {
  FindByRegexOptions,
  FindByTextOptions,
  FindPredicate,
  FindSimilarOptions,
} from '../types'
import { resolveDomAdapter, type DomAdapter } from '../core/dom-adapter'
import { areElementsAlike, filterAttributes } from '../core/similarity'
import { getElementDirectText } from '../core/storage-tools'
import {
  collectDeepElements,
  collectQueryContextRoots,
  getDeepParentElement,
} from '../core/shadow-dom'
import { cleanText, escapeCssString } from '../core/text-utils'
import {
  cssToXpath,
  extractTypePositionFilters,
  splitCssSelectors,
} from '../core/translator'
import { matchRegex, unwrapRootElement, type RootTarget } from './dom-traversal'
import type { InternalNodeWrapper } from './html-loader'
import {
  filterByTypePosition,
  runXPathQuery,
  tryNativeCssQuery,
} from './query-runner'

const WHITELISTED_ATTRS: Record<string, string> = {
  class_: 'class',
  for_: 'for',
}

export interface FindAllArguments {
  selectors: string[]
  patterns: RegExp[]
  functions: Array<(element: Element) => boolean>
}

export function parseFindAllArguments(args: unknown[]): FindAllArguments {
  if (args.length === 0) {
    throw new TypeError(
      'You have to pass something to search with, like tag name(s), tag attributes, or both.',
    )
  }

  const attributes: Record<string, string> = {}
  const tags = new Set<string>()
  const patterns: RegExp[] = []
  const functions: Array<(element: Element) => boolean> = []

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (typeof arg === 'string') {
      tags.add(arg)
    } else if (Array.isArray(arg) || arg instanceof Set) {
      const arr = Array.from(arg)
      if (!arr.every((x): x is string => typeof x === 'string')) {
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
      functions.push(arg as (element: Element) => boolean)
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
  const selectors: string[] = []
  for (const tag of effectiveTags) {
    let sel = tag
    for (const [key, value] of Object.entries(attributes)) {
      if (!key) continue
      if (key === 'class') {
        const classNames = value.split(/\s+/).filter(Boolean)
        if (classNames.length > 0) {
          sel += classNames
            .map((name) => `[class~="${escapeCssString(name)}"]`)
            .join('')
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

  return { selectors, patterns, functions }
}

function unwrapNodes(items: readonly (Element | InternalNodeWrapper)[]): Element[] {
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

function queryCssStatic(
  root: Element,
  selector: string,
  pierceShadow = true,
  adapter?: DomAdapter,
): Element[] {
  const dom = resolveDomAdapter(adapter)
  const contextRoots = collectQueryContextRoots(root, pierceShadow)
  const branches = selector.includes(',') ? splitCssSelectors(selector) : [selector]
  const combined: Element[] = []
  const seen = new Set<Element>()

  for (const branch of branches) {
    const typePos = extractTypePositionFilters(branch)
    const executable = typePos ? typePos.selector : branch
    const xpathExpr = cssToXpath(executable)
    const nativeHits = tryNativeCssQuery(root, executable, contextRoots)
    const rawHits = nativeHits
      ? typePos
        ? filterByTypePosition(nativeHits, typePos.filters, typePos.nativeVerifySelector)
        : nativeHits
      : (() => {
          const xpHits = runXPathQuery(
            root,
            xpathExpr,
            pierceShadow,
            executable,
            dom,
            contextRoots,
          )
          return typePos
            ? filterByTypePosition(xpHits, typePos.filters, typePos.nativeVerifySelector)
            : xpHits
        })()

    for (const el of unwrapNodes(rawHits)) {
      if (!seen.has(el)) {
        seen.add(el)
        combined.push(el)
      }
    }
  }
  return combined
}

export function findAllPredicates<T extends Element = Element>(
  target: RootTarget,
  ...args: FindPredicate[]
): T[] {
  const root = unwrapRootElement(target)
  const { selectors, patterns, functions } = parseFindAllArguments(args)

  let results: Element[] =
    selectors.length > 0
      ? queryCssStatic(root, selectors.join(', '), true)
      : collectDeepElements(root, true, false)

  if (results.length > 0) {
    for (const pattern of patterns) {
      results = results.filter((el) =>
        matchRegex(getElementDirectText(el), pattern, {
          cleanMatch: false,
          caseSensitive: !pattern.ignoreCase,
        }),
      )
    }
    for (const fn of functions) {
      results = results.filter((el) => Boolean(fn(el)))
    }
  }

  return results as T[]
}

export function findPredicates<T extends Element = Element>(
  target: RootTarget,
  ...args: FindPredicate[]
): T | null {
  const all = findAllPredicates<T>(target, ...args)
  return all.length > 0 ? all[0] : null
}

function countAncestors(element: Element): number {
  let depth = 0
  let current = getDeepParentElement(element)
  while (current) {
    depth++
    current = getDeepParentElement(current)
  }
  return depth
}

export function findSimilarElements(
  rootEl: Element,
  similarityThresholdOrOptions: number | FindSimilarOptions = 0.2,
  ignoreAttributes: readonly string[] = ['href', 'src'],
  matchText = false,
  adapter?: DomAdapter,
): Element[] {
  const dom = resolveDomAdapter(adapter)
  const isOptions =
    typeof similarityThresholdOrOptions === 'object' &&
    similarityThresholdOrOptions !== null
  const threshold = isOptions
    ? (similarityThresholdOrOptions.similarityThreshold ??
      similarityThresholdOrOptions.similarity_threshold ??
      0.2)
    : similarityThresholdOrOptions
  const ignoredAttrs = isOptions
    ? (similarityThresholdOrOptions.ignoreAttributes ??
      similarityThresholdOrOptions.ignore_attributes ??
      ['href', 'src'])
    : ignoreAttributes
  const shouldMatchText = isOptions
    ? (similarityThresholdOrOptions.matchText ??
      similarityThresholdOrOptions.match_text ??
      false)
    : matchText

  const currentDepth = countAncestors(rootEl)
  const targetAttrs = filterAttributes(rootEl, ignoredAttrs)

  const pathParts = [rootEl.tagName.toLowerCase()]
  const parentEl = getDeepParentElement(rootEl)
  if (parentEl) {
    pathParts.unshift(parentEl.tagName.toLowerCase())
    const grandParentEl = getDeepParentElement(parentEl)
    if (grandParentEl) {
      pathParts.unshift(grandParentEl.tagName.toLowerCase())
    }
  }

  const similarElements: Element[] = []
  const seen = new Set<Element>()
  const rootNode =
    typeof rootEl.getRootNode === 'function' ? rootEl.getRootNode() : undefined
  const inShadow = Boolean(rootNode && (rootNode as ShadowRoot).host)

  if (!inShadow) {
    const xpathPath = `//${pathParts.join('/')}[count(ancestor::*) = ${currentDepth}]`
    const snapshot = dom.evaluateXPath(xpathPath, rootEl)
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
        seen.add(candidate)
        similarElements.push(candidate)
      }
    }
  }

  if (inShadow || similarElements.length === 0) {
    let topAncestor: Element = rootEl
    let currParent = getDeepParentElement(topAncestor)
    while (currParent) {
      topAncestor = currParent
      currParent = getDeepParentElement(topAncestor)
    }
    const allCandidates = collectDeepElements(topAncestor, true, true)
    const targetTag = pathParts[pathParts.length - 1]
    const expectedParentTag =
      pathParts.length >= 2 ? pathParts[pathParts.length - 2] : undefined
    const expectedGrandTag =
      pathParts.length >= 3 ? pathParts[pathParts.length - 3] : undefined

    for (const candidate of allCandidates) {
      if (candidate === rootEl || seen.has(candidate)) continue
      if (candidate.tagName.toLowerCase() !== targetTag) continue
      if (countAncestors(candidate) !== currentDepth) continue
      const candParent = getDeepParentElement(candidate)
      if (expectedParentTag && candParent?.tagName.toLowerCase() !== expectedParentTag) {
        continue
      }
      if (expectedGrandTag) {
        const candGrand = candParent ? getDeepParentElement(candParent) : undefined
        if (candGrand?.tagName.toLowerCase() !== expectedGrandTag) continue
      }
      if (
        areElementsAlike(
          rootEl,
          targetAttrs,
          candidate,
          ignoredAttrs,
          threshold,
          shouldMatchText,
        )
      ) {
        seen.add(candidate)
        similarElements.push(candidate)
      }
    }
  }

  return similarElements
}

export function findSimilar<T extends Element = Element>(
  element: Element,
  similarityThresholdOrOptions: number | FindSimilarOptions = 0.2,
  ignoreAttributes: readonly string[] = ['href', 'src'],
  matchText = false,
  adapter?: DomAdapter,
): T[] {
  return findSimilarElements(
    element,
    similarityThresholdOrOptions,
    ignoreAttributes,
    matchText,
    adapter,
  ) as T[]
}

export function findElementsByText(
  rootEl: Element,
  pierceShadow: boolean,
  text: string,
  firstMatchOrOptions: boolean | FindByTextOptions = true,
  partial = false,
  caseSensitive = false,
  cleanMatch = true,
): Element[] {
  const isOptions =
    typeof firstMatchOrOptions === 'object' && firstMatchOrOptions !== null
  const firstMatch = isOptions
    ? (firstMatchOrOptions.firstMatch ?? firstMatchOrOptions.first_match ?? true)
    : firstMatchOrOptions
  const isPartial = isOptions ? (firstMatchOrOptions.partial ?? false) : partial
  const isCaseSensitive = isOptions
    ? (firstMatchOrOptions.caseSensitive ??
      firstMatchOrOptions.case_sensitive ??
      false)
    : caseSensitive
  const isCleanMatch = isOptions
    ? (firstMatchOrOptions.cleanMatch ?? firstMatchOrOptions.clean_match ?? true)
    : cleanMatch

  const queryText = isCaseSensitive ? text : text.toLowerCase()
  const results: Element[] = []
  const descendants = collectDeepElements(rootEl, pierceShadow, false)

  for (let i = 0; i < descendants.length; i++) {
    const el = descendants[i]
    const directText = getElementDirectText(el)
    if (!directText || !directText.trim()) continue

    let nodeText = isCleanMatch ? cleanText(directText) : directText
    if (!isCaseSensitive) {
      nodeText = nodeText.toLowerCase()
    }

    if (isPartial ? nodeText.includes(queryText) : nodeText === queryText) {
      results.push(el)
      if (firstMatch) {
        return results
      }
    }
  }

  return results
}

export function findByText<T extends Element = Element>(
  target: RootTarget,
  text: string,
  firstMatchOrOptions?: true | (FindByTextOptions & { firstMatch?: true; first_match?: true }),
  partial?: boolean,
  caseSensitive?: boolean,
  cleanMatch?: boolean,
): T | null
export function findByText<T extends Element = Element>(
  target: RootTarget,
  text: string,
  firstMatchOrOptions: false | (FindByTextOptions & { firstMatch: false }) | (FindByTextOptions & { first_match: false }),
  partial?: boolean,
  caseSensitive?: boolean,
  cleanMatch?: boolean,
): T[]
export function findByText<T extends Element = Element>(
  target: RootTarget,
  text: string,
  firstMatchOrOptions: boolean | FindByTextOptions = true,
  partial = false,
  caseSensitive = false,
  cleanMatch = true,
): T | T[] | null {
  const root = unwrapRootElement(target)
  const isOptions =
    typeof firstMatchOrOptions === 'object' && firstMatchOrOptions !== null
  const pierceShadow = isOptions ? (firstMatchOrOptions.pierceShadow ?? true) : true
  const firstMatch = isOptions
    ? (firstMatchOrOptions.firstMatch ?? firstMatchOrOptions.first_match ?? true)
    : firstMatchOrOptions
  const results = findElementsByText(
    root,
    pierceShadow,
    text,
    firstMatchOrOptions,
    partial,
    caseSensitive,
    cleanMatch,
  ) as T[]
  if (firstMatch) {
    return results.length > 0 ? results[0] : null
  }
  return results
}

export function findAllByText<T extends Element = Element>(
  target: RootTarget,
  text: string,
  options: Omit<FindByTextOptions, 'firstMatch' | 'first_match'> = {},
): T[] {
  return findByText<T>(target, text, { ...options, firstMatch: false })
}

export function findElementsByRegex(
  rootEl: Element,
  pierceShadow: boolean,
  query: string | RegExp,
  firstMatchOrOptions: boolean | FindByRegexOptions = true,
  caseSensitive = false,
  cleanMatch = true,
): Element[] {
  const isOptions =
    typeof firstMatchOrOptions === 'object' && firstMatchOrOptions !== null
  const firstMatch = isOptions
    ? (firstMatchOrOptions.firstMatch ?? firstMatchOrOptions.first_match ?? true)
    : firstMatchOrOptions
  const isCaseSensitive = isOptions
    ? (firstMatchOrOptions.caseSensitive ??
      firstMatchOrOptions.case_sensitive ??
      false)
    : caseSensitive
  const isCleanMatch = isOptions
    ? (firstMatchOrOptions.cleanMatch ?? firstMatchOrOptions.clean_match ?? true)
    : cleanMatch

  const results: Element[] = []
  const descendants = collectDeepElements(rootEl, pierceShadow, false)

  for (let i = 0; i < descendants.length; i++) {
    const el = descendants[i]
    const directText = getElementDirectText(el)
    if (!directText || !directText.trim()) continue

    const matched = matchRegex(directText, query, {
      cleanMatch: isCleanMatch,
      caseSensitive: isCaseSensitive,
    })
    if (matched) {
      results.push(el)
      if (firstMatch) {
        return results
      }
    }
  }

  return results
}

export function findByRegex<T extends Element = Element>(
  target: RootTarget,
  query: string | RegExp,
  firstMatchOrOptions?: true | (FindByRegexOptions & { firstMatch?: true; first_match?: true }),
  caseSensitive?: boolean,
  cleanMatch?: boolean,
): T | null
export function findByRegex<T extends Element = Element>(
  target: RootTarget,
  query: string | RegExp,
  firstMatchOrOptions: false | (FindByRegexOptions & { firstMatch: false }) | (FindByRegexOptions & { first_match: false }),
  caseSensitive?: boolean,
  cleanMatch?: boolean,
): T[]
export function findByRegex<T extends Element = Element>(
  target: RootTarget,
  query: string | RegExp,
  firstMatchOrOptions: boolean | FindByRegexOptions = true,
  caseSensitive = false,
  cleanMatch = true,
): T | T[] | null {
  const root = unwrapRootElement(target)
  const isOptions =
    typeof firstMatchOrOptions === 'object' && firstMatchOrOptions !== null
  const pierceShadow = isOptions ? (firstMatchOrOptions.pierceShadow ?? true) : true
  const firstMatch = isOptions
    ? (firstMatchOrOptions.firstMatch ?? firstMatchOrOptions.first_match ?? true)
    : firstMatchOrOptions
  const results = findElementsByRegex(
    root,
    pierceShadow,
    query,
    firstMatchOrOptions,
    caseSensitive,
    cleanMatch,
  ) as T[]
  if (firstMatch) {
    return results.length > 0 ? results[0] : null
  }
  return results
}

export function findAllByRegex<T extends Element = Element>(
  target: RootTarget,
  query: string | RegExp,
  options: Omit<FindByRegexOptions, 'firstMatch' | 'first_match'> = {},
): T[] {
  return findByRegex<T>(target, query, { ...options, firstMatch: false })
}
