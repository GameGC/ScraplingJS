import { parseHTML } from 'linkedom'
import xpathPackage from 'xpath'
import type { DomAdapter, XPathNodeSnapshot } from './core/dom-adapter'

interface ParsedXPath {
  select(options: {
    node: Node
    isHtml?: boolean
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

/**
 * A ready-to-use `DomAdapter` for Node.js, built on `linkedom` + `xpath`.
 *
 * ```ts
 * import { setDomAdapter } from 'scrapling-js'
 * import { createNodeDomAdapter } from 'scrapling-js/node'
 *
 * setDomAdapter(createNodeDomAdapter())
 * ```
 *
 * `linkedom` and `xpath` are optional peer dependencies; install them only when
 * you use this entry point.
 */
export function createNodeDomAdapter(): DomAdapter {
  return {
    parseHtml(html: string): Document {
      // linkedom 0.18 + xpath 0.0.34 silently return zero nodes for every
      // XPath query when the document has a doctype. Puppeteer/Playwright
      // `page.content()` always includes one, so drop it before parsing.
      return parseHTML(html.replace(/^\s*<!\s*DOCTYPE[^>]*>/i, '')).document as Document
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
      const nodes = (Array.isArray(selected) ? selected : selected == null ? [] : [selected]).filter(
        (node): node is Node =>
          Boolean(node) && typeof node === 'object' && 'nodeType' in (node as object),
      )
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
