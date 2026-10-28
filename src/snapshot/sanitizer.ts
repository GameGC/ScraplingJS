import { Selector } from '../parser/selector'

const HIDING_DECLARATIONS = new Set([
  'display:none',
  'visibility:hidden',
  'visibility:collapse',
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

function nodeToMarkdown(node: Node): string {
  if (node.nodeType === 3) {
    return sanitizeTextForAi(node.nodeValue ?? '')
  }
  if (node.nodeType !== 1) {
    return ''
  }
  const el = node as Element
  const tag = el.tagName.toLowerCase()
  const childrenMd = Array.from(el.childNodes).map(nodeToMarkdown).join('')

  switch (tag) {
    case 'h1':
      return `\n# ${childrenMd.trim()}\n`
    case 'h2':
      return `\n## ${childrenMd.trim()}\n`
    case 'h3':
      return `\n### ${childrenMd.trim()}\n`
    case 'h4':
      return `\n#### ${childrenMd.trim()}\n`
    case 'h5':
      return `\n##### ${childrenMd.trim()}\n`
    case 'h6':
      return `\n###### ${childrenMd.trim()}\n`
    case 'p':
      return `\n${childrenMd.trim()}\n`
    case 'br':
      return '\n'
    case 'strong':
    case 'b':
      return `**${childrenMd.trim()}**`
    case 'em':
    case 'i':
      return `*${childrenMd.trim()}*`
    case 'code':
      return `\`${childrenMd}\``
    case 'pre':
      return `\n\`\`\`\n${(el.textContent ?? '').trim()}\n\`\`\`\n`
    case 'a': {
      const href = el.getAttribute('href')
      const label = childrenMd.trim()
      return href ? `[${label}](${href})` : label
    }
    case 'img': {
      const src = el.getAttribute('src')
      const alt = el.getAttribute('alt') ?? ''
      return src ? `![${alt}](${src})` : alt
    }
    case 'tr': {
      const cells: string[] = []
      for (const child of Array.from(el.children)) {
        const cellTag = child.tagName.toLowerCase()
        if (cellTag === 'td' || cellTag === 'th') {
          cells.push(
            nodeToMarkdown(child)
              .trim()
              .replace(/\s*\n\s*/g, ' '),
          )
        }
      }
      return `\n| ${cells.join(' | ')} |`
    }
    case 'table':
      return `\n${childrenMd.replace(/^\n+/, '').trim()}\n`
    case 'thead':
    case 'tbody':
    case 'tfoot':
      return childrenMd
    case 'th':
    case 'td':
      return childrenMd.trim()
    case 'li':
      return `\n- ${childrenMd.trim()}`
    case 'ul':
    case 'ol':
      return `\n${childrenMd.trim()}\n`
    default:
      return childrenMd
  }
}

export function htmlToMarkdown(
  input: Element | Selector | string,
  options?: { cssSelector?: string; mainContentOnly?: boolean },
): string {
  const page =
    input instanceof Selector
      ? input
      : typeof input === 'string'
        ? new Selector(input)
        : Selector.fromElement(input)

  const baseTarget = options?.mainContentOnly
    ? (page.css('body').first ?? page)
    : page

  const targets = options?.cssSelector
    ? baseTarget.css(options.cssSelector)
    : [baseTarget]

  const blocks: string[] = []
  for (const item of targets) {
    if (!item.rawNode) continue
    const cleaned = sanitizeElementForAi(item.rawNode)
    const md = nodeToMarkdown(cleaned)
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    if (md) {
      blocks.push(md)
    }
  }
  return blocks.join('\n\n')
}
