import type { DomAdapter } from '../core/dom-adapter'
import { getDeepParentElement } from '../core/shadow-dom'

export type InternalNodeWrapper =
  | { kind: 'element'; element: Element }
  | { kind: 'text'; textValue: string; parentElement?: Element | null }

export interface LoadedSelectorRoot {
  wrapper: InternalNodeWrapper
  rawBody: string | Uint8Array
}

function removeCommentsFromNode(root: Node): void {
  const doc = root.ownerDocument ?? (root as Document)
  if (!doc || typeof doc.createTreeWalker !== 'function') return
  const walker = doc.createTreeWalker(root, 128)
  const comments: Comment[] = []
  let current = walker.nextNode()
  while (current) {
    comments.push(current as Comment)
    current = walker.nextNode()
  }
  for (const comment of comments) {
    comment.parentNode?.removeChild(comment)
  }
}

function normalizeTextNodes(root: Node): void {
  root.normalize()
}

function parseHtmlToElement(
  htmlContent: string,
  keepComments: boolean,
  adapter: DomAdapter,
): { rootElement: Element; document: Document } {
  const cleaned = htmlContent.trim().replace(/\x00/g, '') || '<html/>'
  const doc = adapter.parseHtml(cleaned, 'text/html')
  if (!keepComments) {
    removeCommentsFromNode(doc)
    normalizeTextNodes(doc)
  }
  return {
    rootElement: doc.documentElement,
    document: doc,
  }
}

const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
])

function escapeHtmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function formatPrettyHtml(node: Element, indent = 0): string {
  const pad = '  '.repeat(indent)
  const tag = node.tagName.toLowerCase()
  let attrs = ''
  for (let i = 0; i < node.attributes.length; i++) {
    const a = node.attributes.item(i)
    if (a) {
      attrs += ` ${a.name}="${escapeHtmlAttribute(a.value)}"`
    }
  }
  if (VOID_ELEMENTS.has(tag)) {
    return `${pad}<${tag}${attrs}>`
  }
  if (node.children.length === 0) {
    const text = escapeHtmlText(node.textContent ?? '')
    return `${pad}<${tag}${attrs}>${text}</${tag}>`
  }
  const childLines: string[] = []
  for (let i = 0; i < node.childNodes.length; i++) {
    const child = node.childNodes[i]
    if (child.nodeType === 1) {
      childLines.push(formatPrettyHtml(child as Element, indent + 1))
    } else if (child.nodeType === 3) {
      const t = (child.nodeValue ?? '').trim()
      if (t) {
        childLines.push(`${'  '.repeat(indent + 1)}${escapeHtmlText(t)}`)
      }
    }
  }
  return `${pad}<${tag}${attrs}>\n${childLines.join('\n')}\n${pad}</${tag}>`
}

export function loadSelectorRoot(
  rootOrContent: string | Uint8Array | Element | Document | DocumentFragment | ShadowRoot | Node | InternalNodeWrapper,
  keepComments: boolean,
  encoding: string,
  adapter: DomAdapter,
): LoadedSelectorRoot {
  if (typeof rootOrContent === 'string' || rootOrContent instanceof Uint8Array) {
    const htmlString =
      typeof rootOrContent === 'string'
        ? rootOrContent
        : new TextDecoder(encoding).decode(rootOrContent).replace(/\x00/g, '')
    const { rootElement } = parseHtmlToElement(htmlString, keepComments, adapter)
    return {
      wrapper: { kind: 'element', element: rootElement },
      rawBody: rootOrContent,
    }
  }

  const rootArg = rootOrContent
  if (
    rootArg &&
    typeof rootArg === 'object' &&
    'kind' in rootArg &&
    (rootArg.kind === 'text' || rootArg.kind === 'element')
  ) {
    return { wrapper: rootArg as InternalNodeWrapper, rawBody: '' }
  }
  if (adapter.isDocument(rootArg)) {
    if (!keepComments) {
      removeCommentsFromNode(rootArg)
      normalizeTextNodes(rootArg)
    }
    return {
      wrapper: { kind: 'element', element: rootArg.documentElement },
      rawBody: '',
    }
  }
  if (adapter.isShadowRoot(rootArg) && rootArg.host) {
    return { wrapper: { kind: 'element', element: rootArg.host }, rawBody: '' }
  }
  if (adapter.isElement(rootArg)) {
    return { wrapper: { kind: 'element', element: rootArg }, rawBody: '' }
  }
  if (adapter.isDocumentFragment(rootArg)) {
    const firstElement = rootArg.firstElementChild
    if (firstElement) {
      return { wrapper: { kind: 'element', element: firstElement }, rawBody: '' }
    }
    return {
      wrapper: {
        kind: 'text',
        textValue: rootArg.textContent ?? '',
        parentElement: null,
      },
      rawBody: '',
    }
  }
  if (rootArg && typeof (rootArg as Node).nodeType === 'number') {
    const node = rootArg as Node
    if (node.nodeType === 3) {
      return {
        wrapper: {
          kind: 'text',
          textValue: node.nodeValue ?? '',
          parentElement: getDeepParentElement(node),
        },
        rawBody: '',
      }
    }
    if (node.nodeType === 2) {
      return {
        wrapper: {
          kind: 'text',
          textValue: (node as Attr).value ?? node.nodeValue ?? '',
          parentElement: (node as Attr).ownerElement ?? null,
        },
        rawBody: '',
      }
    }
    if (node.nodeType === 9 && (node as Document).documentElement) {
      return {
        wrapper: { kind: 'element', element: (node as Document).documentElement },
        rawBody: '',
      }
    }
    return {
      wrapper: {
        kind: 'text',
        textValue: String(node.textContent ?? ''),
        parentElement: getDeepParentElement(node),
      },
      rawBody: '',
    }
  }

  throw new TypeError('Invalid root node provided to Selector')
}
