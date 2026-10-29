import type { BrowserAction, SelectorWaitState, StorageSystem } from '../types'
import type { DomAdapter } from '../core/dom-adapter'
import { Selector } from '../parser/selector'
import { isElementVisible } from '../core/utils'
import { waitUntilCondition } from '../persistence/dom-waiter'

export function validateActions(actions: BrowserAction[]): void {
  for (let i = 0; i < actions.length; i++) {
    const index = i + 1
    const action = actions[i]
    if (action.type !== 'wait_element') {
      throw new Error(`Action ${index} has unsupported type '${String(action.type)}'.`)
    }
    if (!action.target) {
      throw new Error(`Action ${index} (wait_element) needs 'target'.`)
    }
    if (
      action.state !== undefined &&
      action.state !== 'attached' &&
      action.state !== 'detached' &&
      action.state !== 'visible' &&
      action.state !== 'hidden'
    ) {
      throw new Error(`Action ${index} (wait_element) invalid 'state'.`)
    }
    if (action.timeout !== undefined && (typeof action.timeout !== 'number' || action.timeout < 0)) {
      throw new Error(`Action ${index} (wait_element) 'timeout' must be a non-negative number.`)
    }
  }
}

function createTargetSelector(
  doc: Document,
  storage?: StorageSystem,
  dom?: DomAdapter,
): Selector {
  return new Selector({
    root: doc.documentElement,
    url: doc.location?.href ?? 'default',
    _storage: storage,
    dom,
  })
}

function resolveTargetElement(page: Selector, target: string): Element | null {
  if (target.startsWith('//') || target.startsWith('.//')) {
    const res = page.xpath(target, { autoSave: true })
    return res.first?.rawNode ?? null
  }
  const res = page.css(target, { autoSave: true })
  return res.first?.rawNode ?? null
}

async function waitForElementCondition(
  doc: Document,
  target: string,
  state: SelectorWaitState = 'visible',
  timeout = 30000,
  storage?: StorageSystem,
  signal?: AbortSignal,
  dom?: DomAdapter,
): Promise<Element | null> {
  if (signal?.aborted) {
    throw signal.reason ?? new Error('Aborted')
  }

  const page = createTargetSelector(doc, storage, dom)
  const check = (): { met: true; el: Element | null } | { met: false } => {
    const el = resolveTargetElement(page, target)
    if (state === 'attached' && el) return { met: true, el }
    if (state === 'detached' && !el) return { met: true, el: null }
    if (state === 'visible' && el && isElementVisible(el)) return { met: true, el }
    if (state === 'hidden' && (!el || !isElementVisible(el))) return { met: true, el }
    return { met: false }
  }

  const initial = check()
  if (initial.met) {
    return initial.el
  }

  if (timeout <= 0) {
    throw new Error(`Timeout waiting for '${target}' to reach state '${state}'`)
  }

  const { promise } = waitUntilCondition(
    doc,
    () => {
      const current = check()
      return current.met ? current : null
    },
    timeout,
    200,
    signal,
  )
  const result = await promise
  if (result === null) {
    throw new Error(`Timeout waiting for '${target}' to reach state '${state}'`)
  }
  return result.el
}

export interface RunBrowserActionsOptions {
  document?: Document
  storage?: StorageSystem
  dom?: DomAdapter
  signal?: AbortSignal
}

/**
 * Runs the adaptive browser action that has no native equivalent:
 * `wait_element` with fingerprint-based relocation.
 *
 * Native input (`click`, `fill`, `scroll`, key presses, load/timer waits) is
 * intentionally not wrapped here; use DOM APIs or Playwright/Puppeteer for it.
 */
export async function runBrowserActions(
  actions: BrowserAction[],
  options?: RunBrowserActionsOptions,
): Promise<void> {
  validateActions(actions)
  const doc = options?.document ?? document
  const storage = options?.storage
  const dom = options?.dom

  for (let i = 0; i < actions.length; i++) {
    const index = i + 1
    const action = actions[i]
    const actionSignal = action.signal ?? options?.signal

    try {
      if (actionSignal?.aborted) {
        throw actionSignal.reason ?? new Error('Aborted')
      }
      await waitForElementCondition(
        doc,
        action.target,
        action.state ?? 'visible',
        action.timeout ?? 30000,
        storage,
        actionSignal,
        dom,
      )
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(`Action ${index} (${action.type}) failed: ${message}`)
    }
  }
}
