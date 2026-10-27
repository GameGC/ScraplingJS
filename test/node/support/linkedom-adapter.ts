import { parseHTML } from 'linkedom'
import xpathPackage from 'xpath'
import type { DomAdapter, XPathNodeSnapshot } from '../../../src/core/dom-adapter'

interface ParsedXPath {
  select(options: {
    node: Node
    isHtml?: boolean
    caseInsensitive?: boolean
    allowAnyNamespaceForNoPrefix?: boolean
    namespaces?: Record<string, string>
  }): unknown
}

interface XPathModule {
  parse(expression: string): ParsedXPath
}

const xpath = xpathPackage as unknown as XPathModule

function nodeTypeOf(node: unknown): number {
  if (!node || typeof node !== 'object') return 0
  const nodeType = (node as Node).nodeType
  return typeof nodeType === 'number' ? nodeType : 0
}

export function createLinkedomAdapter(): DomAdapter {
  return {
    parseHtml(html: string): Document {
      return parseHTML(html).document as Document
    },

    evaluateXPath(
      expression: string,
      contextNode: Node,
      namespaces?: Record<string, string> | null,
    ): XPathNodeSnapshot {
      const selected = xpath.parse(expression).select({
        node: contextNode,
        isHtml: true,
        allowAnyNamespaceForNoPrefix: true,
        namespaces: namespaces ?? undefined,
      })
      const nodes = (Array.isArray(selected) ? selected : [selected]) as Node[]
      return {
        snapshotLength: nodes.length,
        snapshotItem: (index: number): Node | null => nodes[index] ?? null,
      }
    },

    isElement: (node: unknown): node is Element => nodeTypeOf(node) === 1,
    isDocument: (node: unknown): node is Document => nodeTypeOf(node) === 9,
    isDocumentFragment: (node: unknown): node is DocumentFragment => nodeTypeOf(node) === 11,
    isShadowRoot: (node: unknown): node is ShadowRoot =>
      nodeTypeOf(node) === 11 && Boolean((node as { host?: unknown }).host),
  }
}
