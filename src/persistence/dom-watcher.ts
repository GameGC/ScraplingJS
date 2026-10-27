import {
  createDomObserver,
  type DomAdapter,
  type MutationObserverLike,
} from '../core/dom-adapter'
import { collectDeepShadowRoots } from '../core/shadow-dom'

export function observeDeepTree(
  doc: Document,
  observer: MutationObserverLike,
  observedRoots: WeakSet<Node>,
): void {
  if (!observedRoots.has(doc.documentElement)) {
    observedRoots.add(doc.documentElement)
    observer.observe(doc.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
    })
  }
  for (const shadowRoot of collectDeepShadowRoots(doc.documentElement)) {
    if (!observedRoots.has(shadowRoot)) {
      observedRoots.add(shadowRoot)
      observer.observe(shadowRoot, {
        childList: true,
        subtree: true,
        attributes: true,
      })
    }
  }
}

export function startDomWatcher(
  doc: Document,
  debounceMs: number,
  evaluate: () => void,
  adapter: DomAdapter,
): () => void {
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | null = null
  const observedRoots = new WeakSet<Node>()

  const observer = createDomObserver(adapter, () => {
    if (stopped) return
    if (timer !== null) {
      clearTimeout(timer)
    }
    timer = setTimeout(() => {
      timer = null
      observeDeepTree(doc, observer, observedRoots)
      evaluate()
    }, debounceMs)
  })

  observeDeepTree(doc, observer, observedRoots)
  evaluate()

  return () => {
    if (stopped) return
    stopped = true
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
    observer.disconnect()
  }
}
