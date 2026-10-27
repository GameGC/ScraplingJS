import { xpathLiteral } from './translator'

export interface ElementSelectorTarget {
  tag?: string
  attrib?: { get(key: string): unknown }
  parent?: ElementSelectorTarget | null
  children?: Iterable<ElementSelectorTarget>
  rawNode?: unknown
}

export function generateElementSelector(
  elementSelector: ElementSelectorTarget | null | undefined,
  selection: 'css' | 'xpath' = 'css',
  fullPath = false,
): string {
  if (!elementSelector || elementSelector.tag === '#text') {
    return ''
  }

  const selectorPath: string[] = []
  let target: ElementSelectorTarget | null | undefined = elementSelector
  const isCss = selection.toLowerCase() === 'css'

  while (target !== null && target !== undefined) {
    if (target.parent) {
      const idRaw = target.attrib?.get('id')
      const id = idRaw !== undefined && idRaw !== null ? String(idRaw) : ''
      if (id) {
        let part: string
        if (isCss) {
          const escapedId =
            typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
              ? CSS.escape(id)
              : id.replace(/([^\w-])/g, '\\$1')
          part = `#${escapedId}`
        } else if (fullPath) {
          part = `*[@id=${xpathLiteral(id)}]`
        } else {
          part = `[@id=${xpathLiteral(id)}]`
        }
        selectorPath.push(part)
        if (!fullPath) {
          return isCss
            ? selectorPath.slice().reverse().join(' > ')
            : `//*${selectorPath.slice().reverse().join('/')}`
        }
      } else {
        let part = `${target.tag}`
        const counter: Record<string, number> = {}
        let position = 1
        if (target.parent.children) {
          for (const child of target.parent.children) {
            const childTag = child.tag ?? ''
            counter[childTag] = (counter[childTag] ?? 0) + 1
            if (child.rawNode === target.rawNode) {
              position = counter[childTag]
            }
          }
        }
        if ((counter[target.tag ?? ''] ?? 0) > 1) {
          part += isCss ? `:nth-of-type(${position})` : `[${position}]`
        }
        selectorPath.push(part)
      }
      target = target.parent
      if (target === null || target.tag === 'html') {
        return isCss
          ? selectorPath.slice().reverse().join(' > ')
          : `//${selectorPath.slice().reverse().join('/')}`
      }
    } else {
      break
    }
  }

  return isCss
    ? selectorPath.slice().reverse().join(' > ')
    : `//${selectorPath.slice().reverse().join('/')}`
}

