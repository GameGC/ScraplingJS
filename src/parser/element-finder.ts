import type {
  FindByRegexOptions,
  FindByTextOptions,
  FindSimilarOptions,
} from '../types'
import type { DomAdapter } from '../core/dom-adapter'
import { TextHandler } from '../core/text-handler'
import { areElementsAlike, filterAttributes } from '../core/similarity'
import { getElementDirectText } from '../core/storage-tools'
import {
  collectDeepElements,
  getDeepParentElement,
} from '../core/shadow-dom'
import { escapeCssString } from '../core/text-utils'

const WHITELISTED_ATTRS: Record<string, string> = {
  class_: 'class',
  for_: 'for',
}

export interface FindAllArguments {
  selectors: string[]
  patterns: RegExp[]
  functions: Array<(element: unknown) => boolean>
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
  const functions: Array<(element: unknown) => boolean> = []

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
        tags.add(t as string)
      }
    } else if (arg instanceof RegExp) {
      patterns.push(arg)
    } else if (typeof arg === 'function') {
      functions.push(arg as (element: unknown) => boolean)
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

export function findSimilarElements(
  rootEl: Element,
  similarityThresholdOrOptions: number | FindSimilarOptions,
  ignoreAttributes: readonly string[],
  matchText: boolean,
  adapter: DomAdapter,
): Element[] {
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

  const xpathPath = `//${pathParts.join('/')}[count(ancestor::*) = ${currentDepth}]`
  const snapshot = adapter.evaluateXPath(xpathPath, rootEl)
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

  return similarElements
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

export function findElementsByText(
  rootEl: Element,
  pierceShadow: boolean,
  text: string,
  firstMatchOrOptions: boolean | FindByTextOptions = true,
  partial = false,
  caseSensitive = false,
  cleanMatch = true,
): Element[] {
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
  const results: Element[] = []
  const descendants = collectDeepElements(rootEl, pierceShadow, false)

  for (let i = 0; i < descendants.length; i++) {
    const el = descendants[i]
    const directText = getElementDirectText(el)
    if (!directText || !directText.trim()) continue

    let nodeText = new TextHandler(directText).toString()
    if (isCleanMatch) {
      nodeText = new TextHandler(directText).clean().toString()
    }
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

export function findElementsByRegex(
  rootEl: Element,
  pierceShadow: boolean,
  query: string | RegExp,
  firstMatchOrOptions: boolean | FindByRegexOptions = true,
  caseSensitive = false,
  cleanMatch = true,
): Element[] {
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

  const results: Element[] = []
  const descendants = collectDeepElements(rootEl, pierceShadow, false)

  for (let i = 0; i < descendants.length; i++) {
    const el = descendants[i]
    const directText = getElementDirectText(el)
    if (!directText || !directText.trim()) continue

    const matched = new TextHandler(directText).re(query, {
      checkMatch: true,
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
