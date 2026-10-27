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

export function captureShadowSnapshot(doc: Document = document): string | null {
  const deepRoots = collectDeepShadowRoots(doc.documentElement ?? doc)
  if (deepRoots.length === 0) {
    return null
  }
  const documentCopy = doc.implementation.createHTMLDocument('')
  let roots = 0

  function copyNode(node: Node, pierce = true): Node {
    if (node.nodeType !== 1) {
      return node.cloneNode(true)
    }
    const el = node as Element
    const name = el.prefix ? `${el.prefix}:${el.localName}` : el.localName
    const target = documentCopy.createElementNS(el.namespaceURI, name)
    for (let i = 0; i < el.attributes.length; i++) {
      const attr = el.attributes.item(i)
      if (attr) {
        target.setAttributeNS(attr.namespaceURI, attr.name, attr.value)
      }
    }
    if (
      pierce &&
      typeof HTMLSlotElement !== 'undefined' &&
      el instanceof HTMLSlotElement &&
      typeof ShadowRoot !== 'undefined' &&
      el.getRootNode() instanceof ShadowRoot
    ) {
      const assigned = el.assignedNodes()
      const childrenToCopy = assigned.length > 0 ? assigned : Array.from(el.childNodes)
      for (const child of childrenToCopy) {
        target.append(copyNode(child, pierce))
      }
      return target
    }
    if (pierce && el.shadowRoot) {
      roots++
      const shadow = documentCopy.createElement('shadow-root')
      for (const child of Array.from(el.shadowRoot.childNodes)) {
        shadow.append(copyNode(child, pierce))
      }
      target.append(shadow)
      for (const lightChild of Array.from(el.childNodes)) {
        target.append(copyNode(lightChild, pierce))
      }
    } else {
      const isTemplate =
        typeof HTMLTemplateElement !== 'undefined' && el instanceof HTMLTemplateElement
      const source = isTemplate ? (el as HTMLTemplateElement).content : el
      const destination = isTemplate
        ? (target as HTMLTemplateElement).content
        : target
      for (const child of Array.from(source.childNodes)) {
        destination.append(copyNode(child, pierce && !isTemplate))
      }
    }
    return target
  }

  const root = copyNode(doc.documentElement) as Element
  if (roots === 0) {
    return null
  }
  documentCopy.adoptNode(root)
  const doctype = doc.doctype ? new XMLSerializer().serializeToString(doc.doctype) : ''
  return doctype + root.outerHTML
}
