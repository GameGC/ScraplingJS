import type { AdaptiveQueryOptions } from '../types'
import type { DomAdapter, XPathNodeSnapshot } from '../core/dom-adapter'
import { DomAdapterError } from '../core/errors'
import { SelectorSyntaxError } from '../core/errors'
import {
  collectDeepShadowRoots,
  getDeepParentElement,
} from '../core/shadow-dom'
import { escapeCssString, escapeRegExpChars } from '../core/text-utils'
import { xpathLiteral } from '../core/translator'
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
    xpathVars = opts.variables ? { ...opts.variables } : {}
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

export function interpolateCssSelector(
  selector: string,
  variables: Record<string, string | number>,
): string {
  let interpolatedSelector = selector
  for (const [varName, varVal] of Object.entries(variables)) {
    const valStr = escapeCssString(String(varVal))
    const quotedPattern = new RegExp(
      '([\'"])\\$' + escapeRegExpChars(varName) + '(?![a-zA-Z0-9_])\\1',
      'g',
    )
    interpolatedSelector = interpolatedSelector.replace(
      quotedPattern,
      () => `"${valStr}"`,
    )
    const barePattern = new RegExp(
      '\\$' + escapeRegExpChars(varName) + '(?![a-zA-Z0-9_])',
      'g',
    )
    interpolatedSelector = interpolatedSelector.replace(
      barePattern,
      () => `"${valStr}"`,
    )
  }
  return interpolatedSelector
}


export function interpolateXPathSelector(
  selector: string,
  variables: Record<string, string | number | boolean>,
): string {
  let resolvedXpath = selector
  for (const [varName, varVal] of Object.entries(variables)) {
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
  return resolvedXpath
}

export function runXPathQuery(
  root: Element,
  resolvedXpath: string,
  pierceShadow: boolean,
  originalSelector: string,
  adapter: DomAdapter,
): Array<Element | InternalNodeWrapper> {
  const contextRoots: Element[] = [root]

  if (pierceShadow) {
    const shadowRoots = collectDeepShadowRoots(root)
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
