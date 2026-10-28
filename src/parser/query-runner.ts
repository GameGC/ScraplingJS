import type { AdaptiveQueryOptions } from '../types'
import type { DomAdapter, XPathNodeSnapshot } from '../core/dom-adapter'
import { DomAdapterError } from '../core/errors'
import { SelectorSyntaxError } from '../core/errors'
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

export interface CssQuerySettings {
  identifier: string
  adaptive: boolean
  autoSave: boolean
  percentage: number
  variables: Record<string, string | number>
}

export interface XPathQuerySettings {
  identifier: string
  adaptive: boolean
  autoSave: boolean
  percentage: number
  variables: Record<string, string | number | boolean>
}

export function resolveCssQuerySettings(
  identifierOrOptions: string | AdaptiveQueryOptions | Record<string, string | number> = '',
  adaptive: boolean | undefined,
  autoSave: boolean | undefined,
  percentage: number,
  variables: Record<string, string | number> | undefined,
  defaults: { adaptive: boolean; autoSave: boolean },
): CssQuerySettings {
  let identifier = ''
  let isAdaptive = adaptive ?? defaults.adaptive
  let isAutoSave = autoSave ?? defaults.autoSave
  let minPercentage = percentage
  const cssVars: Record<string, string | number> = { ...(variables ?? {}) }

  if (typeof identifierOrOptions === 'object' && identifierOrOptions !== null) {
    const opts = identifierOrOptions as AdaptiveQueryOptions
    identifier = typeof opts.identifier === 'string' ? opts.identifier : ''
    isAdaptive =
      typeof opts.adaptive === 'boolean'
        ? opts.adaptive
        : (adaptive ?? defaults.adaptive)
    isAutoSave =
      typeof opts.autoSave === 'boolean'
        ? opts.autoSave
        : typeof opts.auto_save === 'boolean'
          ? opts.auto_save
          : (autoSave ?? defaults.autoSave)
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

  return {
    identifier,
    adaptive: isAdaptive,
    autoSave: isAutoSave,
    percentage: minPercentage,
    variables: cssVars,
  }
}

export function resolveXPathQuerySettings(
  identifierOrOptions: string | AdaptiveQueryOptions | Record<string, string | number> = '',
  adaptive: boolean | undefined,
  autoSave: boolean | undefined,
  percentage: number,
  variables: Record<string, string | number> | undefined,
  defaults: { adaptive: boolean; autoSave: boolean },
): XPathQuerySettings {
  let identifier = ''
  let isAdaptive = adaptive ?? defaults.adaptive
  let isAutoSave = autoSave ?? defaults.autoSave
  let minPercentage = percentage
  let xpathVars: Record<string, string | number | boolean> =
    (variables as Record<string, string | number | boolean> | undefined) ?? {}

  if (typeof identifierOrOptions === 'object' && identifierOrOptions !== null) {
    const opts = identifierOrOptions as AdaptiveQueryOptions
    identifier = typeof opts.identifier === 'string' ? opts.identifier : ''
    isAdaptive =
      typeof opts.adaptive === 'boolean'
        ? opts.adaptive
        : (adaptive ?? defaults.adaptive)
    isAutoSave =
      typeof opts.autoSave === 'boolean'
        ? opts.autoSave
        : typeof opts.auto_save === 'boolean'
          ? opts.auto_save
          : (autoSave ?? defaults.autoSave)
    minPercentage = typeof opts.percentage === 'number' ? opts.percentage : 40
    xpathVars = { ...(variables ?? {}), ...(opts.variables ?? {}) }
    const reserved = new Set([
      'identifier',
      'adaptive',
      'autoSave',
      'auto_save',
      'percentage',
      'variables',
    ])
    for (const [k, v] of Object.entries(identifierOrOptions)) {
      if (!reserved.has(k)) {
        xpathVars[k] = v as string | number | boolean
      }
    }
  } else {
    identifier = identifierOrOptions
  }

  return {
    identifier,
    adaptive: isAdaptive,
    autoSave: isAutoSave,
    percentage: minPercentage,
    variables: xpathVars,
  }
}

function variableAlternation(names: readonly string[]): string | null {
  const usable = names
    .filter((name) => name.length > 0)
    .sort((a, b) => b.length - a.length)
  if (usable.length === 0) {
    return null
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
  return selector.replace(pattern, (match, quote: string | undefined) => {
    const name = match.slice(quote ? 2 : 1, quote ? match.length - 1 : undefined)
    if (!Object.prototype.hasOwnProperty.call(variables, name)) {
      return match
    }
    return `"${escapeCssString(String(variables[name]))}"`
  })
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
  let quote: string | null = null
  for (let i = 0; i < expression.length; i++) {
    const ch = expression[i]
    if (quote) {
      if (ch === quote) quote = null
      continue
    }
    if (ch === "'" || ch === '\"') {
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
    .map((part) => part.replace(/^(\s*)\/\//, '$1.//'))
    .join('|')
}

function firstTopLevelCombinatorIndex(selector: string): number {
  let bracketDepth = 0
  let parenDepth = 0
  let quote: string | null = null
  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i]
    if (quote) {
      if (ch === quote) quote = null
      continue
    }
    if (ch === "'" || ch === '\"') {
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
  try {
    if (firstCompound && root.matches(firstCompound)) {
      return `:scope ${rest}`
    }
  } catch {}
  return `:scope ${trimmed}`
}

export function tryNativeCssQuery(
  root: Element,
  cssSelector: string,
  contextRoots: readonly Element[],
): Element[] | null {
  if (contextRoots.length !== 1) {
    return null
  }
  if (
    typeof root.querySelectorAll !== 'function' ||
    typeof root.matches !== 'function'
  ) {
    return null
  }

  const documentElement = root.ownerDocument?.documentElement
  const rootIsDocumentElement = documentElement === root
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
    return null
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
): Array<Element | InternalNodeWrapper> {
  return wrappers.filter((item) => {
    if ('kind' in item) {
      const element = item.kind === 'element' ? item.element : (item.parentElement ?? null)
      return element !== null && elementMatchesTypePositionFilters(element, filters)
    }
    return elementMatchesTypePositionFilters(item, filters)
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

  const documentElement =
    typeof root.ownerDocument?.documentElement === 'object'
      ? root.ownerDocument.documentElement
      : null
  const rootIsDocumentElement = documentElement === root
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
  } catch (err) {
    if (err instanceof DomAdapterError) {
      throw err
    }
    throw new SelectorSyntaxError(`Invalid XPath selector: ${originalSelector}`)
  }

  return matchedWrappers
}
