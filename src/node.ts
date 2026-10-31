import { parseHTML } from 'linkedom'
import xpathPackage from 'xpath'
import {
  browserDomAdapter,
  type DomAdapter,
  type XPathNodeSnapshot,
} from './core/dom-adapter'

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
      namespaces?: Record<string, string>,
    ): XPathNodeSnapshot {
      const selected = xpath.parse(expression).select({
        node: contextNode,
        isHtml: true,
        allowAnyNamespaceForNoPrefix: true,
        namespaces,
      })
      const candidates = Array.isArray(selected)
        ? selected
        : selected !== undefined && selected !== null
          ? [selected]
          : []
      const nodes = candidates.filter(
        (node): node is Node =>
          Boolean(node) && typeof node === 'object' && 'nodeType' in (node as object),
      )
      return {
        snapshotLength: nodes.length,
        snapshotItem: (index: number): Node | null => nodes[index] ?? null,
      }
    },

    isElement: browserDomAdapter.isElement,
    isDocument: browserDomAdapter.isDocument,
    isDocumentFragment: browserDomAdapter.isDocumentFragment,
    isShadowRoot: browserDomAdapter.isShadowRoot,
  }
}
