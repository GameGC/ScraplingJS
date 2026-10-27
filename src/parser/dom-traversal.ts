import type { GetAllTextOptions } from '../types'
import { getDeepParentElement } from '../core/shadow-dom'

export function getChildElements(element: Element, pierceShadow: boolean): Element[] {
  const children = Array.from(element.children)
  if (pierceShadow && element.shadowRoot) {
    children.push(...Array.from(element.shadowRoot.children))
  }
  return children
}

export function getAncestorElements(
  element: Element,
  pierceShadow: boolean,
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

export function collectAllText(
  root: Element,
  pierceShadow: boolean,
  separatorOrOptions: string | GetAllTextOptions = '\n',
  stripOrOptions: boolean | GetAllTextOptions = false,
  ignoreTags: readonly string[] = ['script', 'style'],
  validValues = true,
): string {
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

  collectTexts(root)
  return allStrings.join(separator)
}
