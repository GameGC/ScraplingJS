const HIDING_DECLARATIONS = new Set([
  'display:none',
  'visibility:hidden',
  'visibility:collapse',
  'content-visibility:hidden',
])
const ZERO_HIDING_PROPERTIES = new Set([
  'opacity',
  'font-size',
  'height',
  'width',
  'max-height',
  'max-width',
])
const CSS_NEWLINE_PATTERN = /\r\n?|\f/g
const STYLE_TOKEN_PATTERN =
  /(\\.)|"(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?|(^|[^\w-])url\((?![ \t\n]*["'])(?:[^)\\]|\\.?)*\)?|(\/\*[\s\S]*?(?:\*\/|$))/gi
const ZERO_VALUE_PATTERN = /^[+-]?(?:0+(?:\.0+)?|\.0+)(?:e[+-]?\d+)?[a-z%]*$/i
const IMPORTANT_SUFFIX_PATTERN = /![ \t\n]*important$/i
const ZWC_PATTERN = /[\u200b\u200c\u200d\ufeff\u2060\u180e]/g
const CONTROL_CHARS_PATTERN = /[\x00-\x08\x0b\x0c\x0e-\x1f]/g

export function isHiddenElement(element: Element): boolean {
  const tag = element.tagName.toLowerCase()
  if (
    tag === 'template' ||
    element.getAttribute('aria-hidden') === 'true' ||
    element.hasAttribute('hidden')
  ) {
    return true
  }
  let style = (element.getAttribute('style') ?? '').replace(CSS_NEWLINE_PATTERN, '\n')
  style = style.replace(STYLE_TOKEN_PATTERN, (_match, g1, prefix, g3) => {
    if (g1) return g1
    if (g3) return ' '
    if (prefix !== undefined && prefix !== null) {
      return prefix + '""'
    }
    return '""'
  })

  for (const declaration of style.split(';')) {
    const colonIdx = declaration.indexOf(':')
    if (colonIdx === -1) continue
    const prop = declaration.slice(0, colonIdx).trim().toLowerCase()
    const rawVal = declaration.slice(colonIdx + 1).trim().toLowerCase()
    const val = rawVal.replace(IMPORTANT_SUFFIX_PATTERN, '').trim()
    if (HIDING_DECLARATIONS.has(`${prop}:${val}`)) {
      return true
    }
    if (ZERO_HIDING_PROPERTIES.has(prop) && ZERO_VALUE_PATTERN.test(val)) {
      return true
    }
  }
  return false
}

export function sanitizeTextForAi(text: string): string {
  return text.replace(ZWC_PATTERN, '').replace(CONTROL_CHARS_PATTERN, '')
}

function cloneWithShadowProjection(node: Node, doc: Document): Node {
  if (node.nodeType !== 1) {
    return node.cloneNode(true)
  }
  const el = node as Element
  const copy = el.cloneNode(false) as Element
  if (el.shadowRoot) {
    for (let i = 0; i < el.shadowRoot.childNodes.length; i++) {
      copy.appendChild(cloneWithShadowProjection(el.shadowRoot.childNodes[i], doc))
    }
  }
  for (let i = 0; i < el.childNodes.length; i++) {
    copy.appendChild(cloneWithShadowProjection(el.childNodes[i], doc))
  }
  return copy
}

export function sanitizeElementForAi(root: Element): Element {
  const doc = root.ownerDocument ?? document
  const clone = cloneWithShadowProjection(root, doc) as Element
  if (isHiddenElement(clone)) {
    clone.innerHTML = ''
    return clone
  }
  const noiseTags = clone.querySelectorAll('script, style, noscript, iframe, svg')
  for (const node of Array.from(noiseTags)) {
    node.parentNode?.removeChild(node)
  }
  const candidates = clone.querySelectorAll('[style], [aria-hidden="true"], [hidden], template')
  for (const node of Array.from(candidates)) {
    if (isHiddenElement(node)) {
      node.parentNode?.removeChild(node)
    }
  }
  return clone
}

