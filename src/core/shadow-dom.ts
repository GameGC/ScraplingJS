export function getDeepParentElement(node: Node | null | undefined): Element | null {
  if (!node) return null
  if (node.parentElement) {
    return node.parentElement
  }
  const rootNode = typeof node.getRootNode === 'function' ? node.getRootNode() : null
  if (
    rootNode &&
    typeof ShadowRoot !== 'undefined' &&
    rootNode instanceof ShadowRoot &&
    rootNode.host
  ) {
    return rootNode.host
  }
  if (node.parentNode && node.parentNode.nodeType === 1) {
    return node.parentNode as Element
  }
  return null
}

export function collectDeepElements(
  root: Node,
  pierceShadow = true,
  includeRoot = false,
): Element[] {
  const result: Element[] = []
  const visited = new Set<Node>()

  function visit(node: Node, isRootNode: boolean): void {
    if (visited.has(node)) return
    visited.add(node)

    if (node.nodeType === 1) {
      const el = node as Element
      if (!isRootNode || includeRoot) {
        result.push(el)
      }
      if (pierceShadow && el.shadowRoot) {
        for (let i = 0; i < el.shadowRoot.childNodes.length; i++) {
          visit(el.shadowRoot.childNodes[i], false)
        }
      }
      if (
        pierceShadow &&
        typeof HTMLSlotElement !== 'undefined' &&
        el instanceof HTMLSlotElement
      ) {
        const assigned = el.assignedNodes({ flatten: true })
        for (let i = 0; i < assigned.length; i++) {
          visit(assigned[i], false)
        }
      }
    }

    for (let i = 0; i < node.childNodes.length; i++) {
      visit(node.childNodes[i], false)
    }
  }

  visit(root, true)
  return result
}

export function collectDeepShadowRoots(root: Node): ShadowRoot[] {
  const roots: ShadowRoot[] = []
  const visited = new Set<Node>()

  function walk(node: Node): void {
    if (visited.has(node)) return
    visited.add(node)

    if (node.nodeType === 1) {
      const el = node as Element
      if (el.shadowRoot) {
        roots.push(el.shadowRoot)
        walk(el.shadowRoot)
      }
    }
    for (let i = 0; i < node.childNodes.length; i++) {
      walk(node.childNodes[i])
    }
  }

  walk(root)
  return roots
}

export function isDeepConnected(root: Node, target: Element | null | undefined): boolean {
  if (!target) return false
  let curr: Node | null = target
  while (curr) {
    if (curr === root) return true
    if (curr.parentNode) {
      curr = curr.parentNode
    } else if (
      typeof ShadowRoot !== 'undefined' &&
      curr instanceof ShadowRoot &&
      curr.host
    ) {
      curr = curr.host
    } else {
      break
    }
  }
  return false
}
