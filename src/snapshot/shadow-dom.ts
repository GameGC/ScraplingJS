import {
  collectDeepElements,
  collectDeepShadowRoots,
  getDeepParentElement,
  isDeepConnected,
} from '../core/shadow-dom'

export {
  collectDeepElements,
  collectDeepShadowRoots,
  getDeepParentElement,
  isDeepConnected,
}

export function captureShadowSnapshot(doc?: Document): string | null {
  const targetDoc = doc ?? (typeof document !== 'undefined' ? document : null)
  if (!targetDoc) {
    throw new TypeError(
      'captureShadowSnapshot needs a Document when running outside a browser.',
    )
  }
  const deepRoots = collectDeepShadowRoots(targetDoc.documentElement ?? targetDoc)
  if (deepRoots.length === 0) {
    return null
  }
  const documentCopy = targetDoc.implementation.createHTMLDocument('')
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

  const root = copyNode(targetDoc.documentElement) as Element
  if (roots === 0) {
    return null
  }
  documentCopy.adoptNode(root)
  const Serializer =
    targetDoc.defaultView?.XMLSerializer ??
    (typeof XMLSerializer !== 'undefined' ? XMLSerializer : null)
  const doctype =
    targetDoc.doctype && Serializer
      ? new Serializer().serializeToString(targetDoc.doctype)
      : ''
  return doctype + root.outerHTML
}
