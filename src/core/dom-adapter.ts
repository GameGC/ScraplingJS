import { DomAdapterError } from './errors'

export { DomAdapterError, ElementHandleError } from './errors'

export interface XPathNodeSnapshot {
  readonly snapshotLength: number
  snapshotItem(index: number): Node | null
}

export interface MutationObserverLike {
  observe(target: Node, options: MutationObserverInit): void
  disconnect(): void
}

export type DomMimeType =
  | 'text/html'
  | 'text/xml'
  | 'application/xhtml+xml'
  | 'image/svg+xml'

export interface DomAdapter {
  parseHtml(html: string, mimeType?: DomMimeType): Document
  evaluateXPath(
    expression: string,
    contextNode: Node,
    namespaces?: Record<string, string> | null,
  ): XPathNodeSnapshot
  isElement(node: unknown): node is Element
  isDocument(node: unknown): node is Document
  isDocumentFragment(node: unknown): node is DocumentFragment
  isShadowRoot(node: unknown): node is ShadowRoot
  createObserver?(callback: (records: MutationRecord[]) => void): MutationObserverLike
}

function nodeTypeOf(node: unknown): number {
  if (!node || typeof node !== 'object') return 0
  const nodeType = (node as Node).nodeType
  return typeof nodeType === 'number' ? nodeType : 0
}

function ownerDocumentOf(node: Node): Document | null {
  if (nodeTypeOf(node) === 9) {
    return node as Document
  }
  return (node as { ownerDocument?: Document | null }).ownerDocument ?? null
}

const ADAPTER_HINT =
  'Pass a DomAdapter through the "dom" option, or register one globally with setDomAdapter(adapter).'

export const browserDomAdapter: DomAdapter = {
  parseHtml(html: string, mimeType: DomMimeType = 'text/html'): Document {
    if (typeof DOMParser === 'undefined') {
      throw new DomAdapterError(
        `Cannot parse HTML: DOMParser is not available in this environment. ${ADAPTER_HINT}`,
      )
    }
    return new DOMParser().parseFromString(html, mimeType)
  },

  evaluateXPath(
    expression: string,
    contextNode: Node,
    namespaces?: Record<string, string> | null,
  ): XPathNodeSnapshot {
    const doc = ownerDocumentOf(contextNode)
    if (!doc || typeof doc.evaluate !== 'function') {
      throw new DomAdapterError(
        `Cannot evaluate XPath: document.evaluate is not available in this environment. ${ADAPTER_HINT}`,
      )
    }
    const resolver = namespaces
      ? {
          lookupNamespaceURI: (prefix: string | null): string | null =>
            (prefix && namespaces[prefix]) || null,
        }
      : null
    return doc.evaluate(
      expression,
      contextNode,
      resolver,
      7,
      null,
    ) as unknown as XPathNodeSnapshot
  },

  isElement: (node: unknown): node is Element => nodeTypeOf(node) === 1,

  isDocument: (node: unknown): node is Document => nodeTypeOf(node) === 9,

  isDocumentFragment: (node: unknown): node is DocumentFragment => nodeTypeOf(node) === 11,

  isShadowRoot: (node: unknown): node is ShadowRoot =>
    nodeTypeOf(node) === 11 && Boolean((node as { host?: unknown }).host),

  createObserver(callback: (records: MutationRecord[]) => void): MutationObserverLike {
    if (typeof MutationObserver === 'undefined') {
      throw new DomAdapterError(
        `Cannot watch for DOM mutations: MutationObserver is not available in this environment. Provide createObserver() in your DomAdapter to use watch() outside a browser.`,
      )
    }
    return new MutationObserver(callback)
  },
}

let registeredAdapter: DomAdapter | null = null

export function setDomAdapter(adapter: DomAdapter | null): void {
  registeredAdapter = adapter
}

export function getDomAdapter(): DomAdapter {
  return registeredAdapter ?? browserDomAdapter
}

export function resolveDomAdapter(adapter?: DomAdapter | null): DomAdapter {
  return adapter ?? getDomAdapter()
}

export function tryCreateDomObserver(
  adapter: DomAdapter | null | undefined,
  callback: (records: MutationRecord[]) => void,
): MutationObserverLike | null {
  if (adapter && typeof adapter.createObserver === 'function') {
    return adapter.createObserver(callback)
  }
  if (typeof MutationObserver !== 'undefined') {
    return new MutationObserver(callback)
  }
  return null
}

export function createDomObserver(
  adapter: DomAdapter | null | undefined,
  callback: (records: MutationRecord[]) => void,
): MutationObserverLike {
  const observer = tryCreateDomObserver(adapter, callback)
  if (!observer) {
    throw new DomAdapterError(
      `Cannot watch for DOM mutations: no MutationObserver and no DomAdapter.createObserver() available. ${ADAPTER_HINT}`,
    )
  }
  return observer
}
