import type { AdaptiveQueryOptions } from '../types'
import type { DomAdapter, XPathNodeSnapshot } from '../core/dom-adapter'
import { DomAdapterError, SelectorSyntaxError } from '../core/errors'
import {
  collectQueryContextRoots,
  getDeepParentElement,
} from '../core/shadow-dom'
import { escapeCssString, escapeRegExpChars } from '../core/text-utils'
import {
  elementMatchesTypePositionFilters,
  splitCssSelectors,
  xpathLiteral,
  type TypePositionFilter,
} from '../core/translator'
import type { InternalNodeWrapper } from './html-loader'

export interface QuerySettings<V = string | number> {
  identifier: string
  autoSave: boolean
  percentage: number
  variables: Record<string, V>
}

export type CssQuerySettings = QuerySettings<string | number>
export type XPathQuerySettings = QuerySettings<string | number | boolean>

const RESERVED_OPTION_KEYS = new Set([
  'identifier',
  'adaptive',
  'autoSave',
  'percentage',
  'variables',
])

export function resolveCssQuerySettings(
  identifierOrOptions: string | AdaptiveQueryOptions | Record<string, string | number> = '',
  autoSave: boolean | undefined,
  percentage: number,
  variables: Record<string, string | number> | undefined,
  defaults: { autoSave: boolean } = { autoSave: true },
): CssQuerySettings {
  let identifier = ''
  let isAutoSave = autoSave ?? defaults.autoSave
  let minPercentage = percentage
  const cssVars: Record<string, string | number> = { ...(variables ?? {}) }

  if (typeof identifierOrOptions === 'object') {
    const opts = identifierOrOptions as AdaptiveQueryOptions
    identifier = typeof opts.identifier === 'string' ? opts.identifier : ''
    isAutoSave =
      typeof opts.autoSave === 'boolean'
        ? opts.autoSave
        : (autoSave ?? defaults.autoSave)
    minPercentage = typeof opts.percentage === 'number' ? opts.percentage : 40
    if (opts.variables) {
      for (const [k, v] of Object.entries(opts.variables)) {
        if (typeof v === 'string' || typeof v === 'number') {
          cssVars[k] = v
        }
      }
    }
    for (const [k, v] of Object.entries(identifierOrOptions)) {
      if (!RESERVED_OPTION_KEYS.has(k) && (typeof v === 'string' || typeof v === 'number')) {
        cssVars[k] = v
      }
    }
  } else {
    identifier = identifierOrOptions
  }

  return {
    identifier,
    autoSave: isAutoSave,
    percentage: minPercentage,
    variables: cssVars,
  }
}

export function resolveXPathQuerySettings(
  identifierOrOptions: string | AdaptiveQueryOptions | Record<string, string | number> = '',
  autoSave: boolean | undefined,
  percentage: number,
  variables: Record<string, string | number> | undefined,
  defaults: { autoSave: boolean } = { autoSave: true },
): XPathQuerySettings {
  let identifier = ''
  let isAutoSave = autoSave ?? defaults.autoSave
  let minPercentage = percentage
  let xpathVars: Record<string, string | number | boolean> = { ...(variables ?? {}) }

  if (typeof identifierOrOptions === 'object') {
    const opts = identifierOrOptions as AdaptiveQueryOptions
    identifier = typeof opts.identifier === 'string' ? opts.identifier : ''
    isAutoSave =
      typeof opts.autoSave === 'boolean'
        ? opts.autoSave
        : (autoSave ?? defaults.autoSave)
    minPercentage = typeof opts.percentage === 'number' ? opts.percentage : 40
    xpathVars = { ...xpathVars, ...(opts.variables ?? {}) }
    for (const [k, v] of Object.entries(identifierOrOptions)) {
      if (!RESERVED_OPTION_KEYS.has(k)) {
        xpathVars[k] = v as string | number | boolean
      }
    }
  } else {
    identifier = identifierOrOptions
  }

  return {
    identifier,
    autoSave: isAutoSave,
    percentage: minPercentage,
    variables: xpathVars,
  }
}

function variableAlternation(names: readonly string[]): string | undefined {
  const usable = names
    .filter((name) => name.length > 0)
    .sort((a, b) => b.length - a.length)
  if (usable.length === 0) {
    return undefined
  }
  return usable.map(escapeRegExpChars).join('|')
}

export function interpolateCssSelector(
  selector: string,
  variables: Record<string, string | number>,
): string {
  const alternation = variableAlternation(Object.keys(variables))
  if (!alternation) {
    return selector
  }
  const pattern = new RegExp(
    `(['\"])\\$(?:${alternation})(?![a-zA-Z0-9_])\\1|\\$(?:${alternation})(?![a-zA-Z0-9_])`,
    'g',
  )
  return selector.replace(
    pattern,
    (match, quote: string | undefined, offset: number) => {
      const name = match.slice(quote ? 2 : 1, quote ? match.length - 1 : undefined)
      if (!Object.prototype.hasOwnProperty.call(variables, name)) {
        return match
      }
      const rawVal = String(variables[name])
      const prevChar = !quote && offset > 0 ? selector[offset - 1] : ''
      if (!quote && (prevChar === '.' || prevChar === '#' || prevChar === '(')) {
        return escapeCssString(rawVal)
      }
      return `"${escapeCssString(rawVal)}"`
    },
  )
}

export function interpolateXPathSelector(
  selector: string,
  variables: Record<string, string | number | boolean>,
): string {
  const alternation = variableAlternation(Object.keys(variables))
  if (!alternation) {
    return selector
  }
  const pattern = new RegExp(`\\$(?:${alternation})(?![a-zA-Z0-9_])`, 'g')
  return selector.replace(pattern, (match) => {
    const name = match.slice(1)
    if (!Object.prototype.hasOwnProperty.call(variables, name)) {
      return match
    }
    const varVal = variables[name]
    return typeof varVal === 'number' || typeof varVal === 'boolean'
      ? String(varVal)
      : xpathLiteral(String(varVal))
  })
}

export function scopeXPathToContext(expression: string): string {
  const parts: string[] = []
  let start = 0
  let depth = 0
  let quote = ''
  for (let i = 0; i < expression.length; i++) {
    const ch = expression[i]
    if (quote) {
      if (ch === quote) quote = ''
      continue
    }
    if (ch === "'" || ch === '"') {
      quote = ch
      continue
    }
    if (ch === '[' || ch === '(') {
      depth++
    } else if (ch === ']' || ch === ')') {
      depth--
    } else if (ch === '|' && depth === 0) {
      parts.push(expression.slice(start, i))
      start = i + 1
    }
  }
  parts.push(expression.slice(start))

  return parts
    .map((part) => part.replace(/^(\s*(?:\(\s*)*)\/\//, '$1.//'))
    .join('|')
}

function firstTopLevelCombinatorIndex(selector: string): number {
  let bracketDepth = 0
  let parenDepth = 0
  let quote = ''
  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i]
    if (quote) {
      if (ch === quote) quote = ''
      continue
    }
    if (ch === "'" || ch === '"') {
      quote = ch
      continue
    }
    if (ch === '[') bracketDepth++
    else if (ch === ']') bracketDepth = Math.max(0, bracketDepth - 1)
    else if (ch === '(') parenDepth++
    else if (ch === ')') parenDepth = Math.max(0, parenDepth - 1)
    else if (bracketDepth === 0 && parenDepth === 0) {
      if (ch === '>' || ch === '+' || ch === '~' || /\s/.test(ch)) {
        return i
      }
    }
  }
  return -1
}

function scopeBranchToRoot(root: Element, branch: string): string {
  const trimmed = branch.trim()
  if (!trimmed) return ':scope'
  if (/^[>+~]/.test(trimmed)) return `:scope ${trimmed}`
  const combinatorIndex = firstTopLevelCombinatorIndex(trimmed)
  if (combinatorIndex < 0) return `:scope ${trimmed}`
  const firstCompound = trimmed.slice(0, combinatorIndex).trim()
  const rest = trimmed.slice(combinatorIndex).trimStart()
  if (!/^[+~]/.test(rest)) {
    try {
      if (firstCompound && root.matches(firstCompound)) {
        return `:scope ${rest}, :scope ${trimmed}`
      }
    } catch {}
  }
  return `:scope ${trimmed}`
}

export function tryNativeCssQuery(
  root: Element,
  cssSelector: string,
  contextRoots: readonly Element[],
): Element[] | undefined {
  if (
    contextRoots.length !== 1 ||
    typeof root.querySelectorAll !== 'function' ||
    typeof root.matches !== 'function'
  ) {
    return undefined
  }

  const rootIsDocumentElement = root.ownerDocument?.documentElement === root
  const branches = rootIsDocumentElement ? [] : splitCssSelectors(cssSelector)
  const matches: Element[] = []
  const seen = new Set<Element>()

  const addMatch = (element: Element): void => {
    if (element === root || seen.has(element)) return
    seen.add(element)
    matches.push(element)
  }

  try {
    if (rootIsDocumentElement) {
      const descendants = root.querySelectorAll(cssSelector)
      for (let i = 0; i < descendants.length; i++) {
        const item = descendants[i]
        if (item && item !== root) addMatch(item)
      }
      if (root.matches(cssSelector)) {
        matches.unshift(root)
      }
      return matches
    }

    for (const branch of branches) {
      const scoped = scopeBranchToRoot(root, branch)
      const descendants = root.querySelectorAll(scoped)
      for (let i = 0; i < descendants.length; i++) {
        const item = descendants[i]
        if (item) addMatch(item)
      }
      if (
        firstTopLevelCombinatorIndex(branch.trim()) < 0 &&
        root.matches(branch.trim())
      ) {
        matches.unshift(root)
        seen.add(root)
      }
    }
  } catch {
    return undefined
  }

  if (branches.length > 1 && matches.length > 1) {
    matches.sort((a, b) => {
      const position = a.compareDocumentPosition(b)
      return position & 4 ? -1 : 1
    })
  }
  return matches
}

export function filterByTypePosition(
  wrappers: readonly (Element | InternalNodeWrapper)[],
  filters: readonly TypePositionFilter[],
  nativeVerifySelector?: string,
): Array<Element | InternalNodeWrapper> {
  return wrappers.filter((item) => {
    const element =
      'kind' in item
        ? item.kind === 'element'
          ? item.element
          : item.parentElement
        : item
    if (!element) return false
    if (filters.length > 0 && !elementMatchesTypePositionFilters(element, filters)) {
      return false
    }
    if (nativeVerifySelector && typeof element.matches === 'function') {
      try {
        return element.matches(nativeVerifySelector)
      } catch {}
    }
    return true
  })
}

export function runXPathQuery(
  root: Element,
  resolvedXpath: string,
  pierceShadow: boolean,
  originalSelector: string,
  adapter: DomAdapter,
  contextRoots?: readonly Element[],
): Array<Element | InternalNodeWrapper> {
  const roots = contextRoots ?? collectQueryContextRoots(root, pierceShadow)
  const matchedWrappers: Array<Element | InternalNodeWrapper> = []
  const seenNodes = new Set<Node>()
  const rootIsDocumentElement = root.ownerDocument?.documentElement === root
  const contextScopedXpath = scopeXPathToContext(resolvedXpath)

  try {
    for (let ctxIdx = 0; ctxIdx < roots.length; ctxIdx++) {
      const ctxRoot = roots[ctxIdx]
      const exprToRun =
        ctxIdx === 0 && rootIsDocumentElement ? resolvedXpath : contextScopedXpath
      const snapshot: XPathNodeSnapshot = adapter.evaluateXPath(exprToRun, ctxRoot)
      for (let i = 0; i < snapshot.snapshotLength; i++) {
        const item = snapshot.snapshotItem(i)
        if (!item || seenNodes.has(item)) continue
        if (item.nodeType === 1) {
          const el = item as Element
          if (!rootIsDocumentElement && !roots.some((r) => r.contains(el))) {
            continue
          }
          seenNodes.add(item)
          matchedWrappers.push(el)
        } else if (item.nodeType === 3) {
          const parentEl = getDeepParentElement(item)
          if (
            !rootIsDocumentElement &&
            (!parentEl || !roots.some((r) => r.contains(parentEl)))
          ) {
            continue
          }
          seenNodes.add(item)
          matchedWrappers.push({
            kind: 'text',
            textValue: item.nodeValue ?? '',
            parentElement: parentEl ?? undefined,
          })
        } else if (item.nodeType === 2) {
          const ownerEl = (item as Attr).ownerElement
          if (
            !rootIsDocumentElement &&
            (!ownerEl || !roots.some((r) => r.contains(ownerEl)))
          ) {
            continue
          }
          seenNodes.add(item)
          matchedWrappers.push({
            kind: 'text',
            textValue: (item as Attr).value ?? '',
            parentElement: ownerEl ?? undefined,
          })
        }
      }
    }
  } catch (err) {
    if (err instanceof DomAdapterError) {
      throw err
    }
    throw new SelectorSyntaxError(`Invalid XPath selector: ${originalSelector}`)
  }

  return matchedWrappers
}
