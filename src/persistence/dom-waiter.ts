import {
  tryCreateDomObserver,
  type DomAdapter,
  type MutationObserverLike,
} from '../core/dom-adapter'
import { observeDeepTree } from './dom-watcher'

export interface WaitUntilHandle<R> {
  promise: Promise<R | null>
  cancel: () => void
}

export function waitUntilCondition<R>(
  doc: Document,
  condition: () => R | null | undefined | false,
  timeoutMs = 10000,
  pollMs = 200,
  signal?: AbortSignal,
  adapter?: DomAdapter | null,
  debounceMs = 10,
): WaitUntilHandle<R> {
  let cancel = () => {}

  const promise = new Promise<R | null>((resolve, reject) => {
    let settled = false
    let cleanup = () => {}

    const finish = (value: R | null, error?: unknown): void => {
      if (settled) return
      settled = true
      cleanup()
      signal?.removeEventListener('abort', onAbort)
      if (error !== undefined) {
        reject(error)
      } else {
        resolve(value)
      }
    }

    const onAbort = (): void => {
      finish(null, signal?.reason ?? new Error('Aborted'))
    }

    if (signal?.aborted) {
      reject(signal.reason ?? new Error('Aborted'))
      return
    }

    try {
      const immediate = condition()
      if (immediate) {
        resolve(immediate)
        return
      }
    } catch (err) {
      reject(err)
      return
    }

    if (timeoutMs <= 0) {
      resolve(null)
      return
    }

    const observedRoots = new WeakSet<Node>()

    const checkNow = (): boolean => {
      if (settled) return true
      try {
        const result = condition()
        if (result) {
          finish(result)
          return true
        }
      } catch (err) {
        finish(null, err)
        return true
      }
      return false
    }

    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    let observer: MutationObserverLike | null = null
    observer = tryCreateDomObserver(adapter, () => {
      if (settled) return
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer)
      }
      debounceTimer = setTimeout(() => {
        debounceTimer = null
        if (settled) return
        if (!checkNow() && observer) {
          observeDeepTree(doc, observer, observedRoots)
        }
      }, debounceMs)
    })

    const intervalId = setInterval(() => {
      checkNow()
    }, pollMs)

    const timeoutId = setTimeout(() => {
      finish(null)
    }, timeoutMs)

    cleanup = () => {
      clearInterval(intervalId)
      clearTimeout(timeoutId)
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer)
        debounceTimer = null
      }
      observer?.disconnect()
    }

    cancel = () => finish(null)
    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true })
    }
    if (observer) {
      observeDeepTree(doc, observer, observedRoots)
    }
  })

  return { promise, cancel }
}
