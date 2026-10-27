export function generateElementSelector(
  elementSelector: any,
  selection: 'css' | 'xpath' = 'css',
  fullPath = false,
): string {
  if (!elementSelector || elementSelector.tag === '#text') {
    return ''
  }

  const selectorPath: string[] = []
  let target: any = elementSelector
  const isCss = selection.toLowerCase() === 'css'

  while (target !== null && target !== undefined) {
    if (target.parent) {
      const id = target.attrib?.get('id')
      if (id) {
        let part: string
        if (isCss) {
          part = `#${id}`
        } else if (fullPath) {
          part = `*[@id='${id}']`
        } else {
          part = `[@id='${id}']`
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
        for (const child of target.parent.children) {
          counter[child.tag] = (counter[child.tag] ?? 0) + 1
          if (child.rawNode === target.rawNode) {
            position = counter[child.tag]
          }
        }
        if ((counter[target.tag] ?? 0) > 1) {
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
