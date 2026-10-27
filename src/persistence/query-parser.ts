import { cssToXpath } from '../core/translator'
import type { AdaptiveQueryOptions } from '../types'

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

/**
 * Ask the DOM whether it accepts the string as CSS. Returns `null` when the
 * environment has no `querySelector` to probe with (Node.js without a DOM), so
 * the caller can fall back to the bundled CSS-to-XPath translator.
 */
function probeCssSupport(query: string, doc: Document | null): boolean | null {
  if (!doc || typeof doc.createDocumentFragment !== 'function') {
    return null
  }
  let fragment: DocumentFragment
  try {
    fragment = doc.createDocumentFragment()
  } catch {
    return null
  }
  if (typeof fragment.querySelector !== 'function') {
    return null
  }
  try {
    fragment.querySelector(query)
    return true
  } catch {
    return false
  }
}

/**
 * Offline CSS check. `cssToXpath` is the exact translator every CSS query goes
 * through, so "translatable" is what "runnable as CSS" means for this library.
 */
function isTranslatableCssSelector(query: string): boolean {
  try {
    cssToXpath(query)
    return true
  } catch {
    return false
  }
}

export function detectQueryMode(
  query: string,
  explicitMode?: 'auto' | 'css' | 'xpath' | 'text',
  scopeDocument?: Document | null,
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
  const doc =
    scopeDocument ?? (typeof document !== 'undefined' ? document : null)
  const cssSupported = probeCssSupport(trimmed, doc)
  if (cssSupported !== null) {
    return cssSupported ? 'css' : 'text'
  }
  return isTranslatableCssSelector(trimmed) ? 'css' : 'text'
}

export function normalizeTextQuery(query: string): string {
  const trimmed = query.trim()
  if (trimmed.startsWith('text=') || trimmed.startsWith('text:')) {
    return trimmed.slice(5).trim()
  }
  return trimmed
}

export function parseQueryArguments<T extends HTMLElement = HTMLElement>(
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
