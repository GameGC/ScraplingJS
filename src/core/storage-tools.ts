import type { BoundingRectInfo, ElementFingerprint } from '../types'
import { getDeepParentElement } from '../snapshot/shadow-dom'
import { cleanText } from './utils'

const SEMANTIC_ATTR_NAMES = [
  'data-testid',
  'data-test',
  'data-cy',
  'data-qa',
  'data-id',
  'aria-label',
  'role',
  'name',
  'placeholder',
  'title',
  'type',
  'alt',
  'for',
]

function isStableClassToken(token: string): boolean {
  if (!token || token.length < 2) return false
  if (/^(?:css|sc|jsx|svelte|tw)-[a-zA-Z0-9_-]{4,}$/.test(token)) return false
  if (/^_[a-zA-Z0-9]{5,}$/.test(token)) return false
  if (/[A-Z].*[0-9]|[0-9].*[A-Z]/.test(token) && token.length > 8 && /__|--/.test(token)) {
    return false
  }
  const digitCount = (token.match(/\d/g) ?? []).length
  if (digitCount >= 4 && digitCount / token.length > 0.4) return false
  return true
}

export function extractStableClasses(classAttr?: string | null): string[] {
  if (!classAttr) return []
  return classAttr
    .split(/\s+/)
    .map((c) => c.trim())
    .filter(isStableClassToken)
}

export function getElementDirectText(element: Element): string {
  const hasElementChildren = element.children.length > 0
  let text = ''
  for (let i = 0; i < element.childNodes.length; i++) {
    const child = element.childNodes[i]
    if (child.nodeType === 1) {
      break
    }
    if (child.nodeType === 3) {
      text += child.nodeValue ?? ''
    }
  }
  if (hasElementChildren && !text.trim()) {
    return ''
  }
  return text
}

export class StorageTools {
  private static cleanAttributes(
    element: Element,
    forbidden: readonly string[] = [],
  ): Record<string, string> {
    const out: Record<string, string> = {}
    if (!element.hasAttributes()) {
      return out
    }
    const forbiddenSet = new Set(forbidden)
    for (let i = 0; i < element.attributes.length; i++) {
      const attr = element.attributes.item(i)
      if (!attr) continue
      const trimmed = attr.value.trim()
      if (trimmed && !forbiddenSet.has(attr.name)) {
        out[attr.name] = trimmed
      }
    }
    return out
  }

  static getElementPath(element: Element): string[] {
    const path: string[] = []
    let current: Element | null = element
    while (current) {
      path.unshift(current.tagName.toLowerCase())
      current = getDeepParentElement(current)
    }
    return path
  }

  static _get_element_path(element: Element): string[] {
    return StorageTools.getElementPath(element)
  }

  static elementToDict(element: Element): ElementFingerprint {
    const parent = getDeepParentElement(element)
    const directText = getElementDirectText(element).trim()
    const fullText = cleanText(element.textContent ?? '').slice(0, 400)
    const cleanedAttrs = StorageTools.cleanAttributes(element)
    const path = StorageTools.getElementPath(element)

    const result: ElementFingerprint = {
      tag: element.tagName.toLowerCase(),
      attributes: cleanedAttrs,
      text: directText ? directText : null,
      all_text: fullText ? fullText : null,
      path,
      depth: path.length,
    }

    const semanticAttrs: Record<string, string> = {}
    for (const key of SEMANTIC_ATTR_NAMES) {
      if (cleanedAttrs[key]) {
        semanticAttrs[key] = cleanedAttrs[key]
      }
    }
    if (Object.keys(semanticAttrs).length > 0) {
      result.semantic_attrs = semanticAttrs
    }

    const stableClasses = extractStableClasses(cleanedAttrs.class)
    if (stableClasses.length > 0) {
      result.stable_classes = stableClasses
    }

    if (parent) {
      const parentAttribs: Record<string, string> = {}
      for (let i = 0; i < parent.attributes.length; i++) {
        const attr = parent.attributes.item(i)
        if (attr) {
          parentAttribs[attr.name] = attr.value
        }
      }
      const parentText = getElementDirectText(parent).trim()
      result.parent_name = parent.tagName.toLowerCase()
      result.parent_attribs = parentAttribs
      result.parent_text = parentText ? parentText : null

      const siblings: string[] = []
      let sameTagIndex = 0
      let foundSelfIndex = 1
      const selfTag = result.tag

      const parentChildren =
        element.parentElement === parent
          ? Array.from(parent.children)
          : parent.shadowRoot
            ? Array.from(parent.shadowRoot.children)
            : Array.from(parent.children)

      for (const child of parentChildren) {
        const childTag = child.tagName.toLowerCase()
        if (childTag === selfTag) {
          sameTagIndex++
          if (child === element) {
            foundSelfIndex = sameTagIndex
          }
        }
        if (child !== element) {
          siblings.push(childTag)
        }
      }
      result.sibling_index = foundSelfIndex
      if (siblings.length > 0) {
        result.siblings = siblings
      }
    }

    const children: string[] = []
    for (let i = 0; i < element.children.length; i++) {
      const child = element.children.item(i)
      if (child) {
        children.push(child.tagName.toLowerCase())
      }
    }
    if (element.shadowRoot) {
      for (let i = 0; i < element.shadowRoot.children.length; i++) {
        const child = element.shadowRoot.children.item(i)
        if (child) {
          children.push(child.tagName.toLowerCase())
        }
      }
    }
    if (children.length > 0) {
      result.children = children
    }

    if (typeof element.getBoundingClientRect === 'function') {
      try {
        const r = element.getBoundingClientRect()
        if (r && (r.width > 0 || r.height > 0)) {
          const rectInfo: BoundingRectInfo = {
            x: Math.round(r.x),
            y: Math.round(r.y),
            width: Math.round(r.width),
            height: Math.round(r.height),
          }
          result.rect = rectInfo
        }
      } catch {}
    }

    return result
  }

  static element_to_dict(element: Element): ElementFingerprint {
    return StorageTools.elementToDict(element)
  }
}

export const _StorageTools = StorageTools
