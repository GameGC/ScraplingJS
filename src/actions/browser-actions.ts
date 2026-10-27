import type { BrowserAction, SelectorWaitState, StorageSystem } from '../types'
import { Selector } from '../parser/selector'
import { isElementVisible, setNativeInputValue, setNativeCheckboxValue } from '../core/utils'

export function validateActions(actions: BrowserAction[]): void {
  for (let i = 0; i < actions.length; i++) {
    const index = i + 1
    const action = actions[i]
    switch (action.type) {
      case 'move':
      case 'click': {
        const hasTarget = action.target !== undefined && action.target !== null && action.target !== ''
        const hasX = action.x !== undefined && action.x !== null
        const hasY = action.y !== undefined && action.y !== null
        if (hasTarget === hasX || hasX !== hasY) {
          throw new Error(
            `Action ${index} (${action.type}) needs 'target' or both 'x' and 'y', not both.`,
          )
        }
        if (action.timeout !== undefined && (typeof action.timeout !== 'number' || action.timeout < 0)) {
          throw new Error(`Action ${index} (${action.type}) 'timeout' must be a non-negative number.`)
        }
        break
      }
      case 'wheel': {
        if (action.delta_x !== undefined && typeof action.delta_x !== 'number') {
          throw new Error(`Action ${index} (wheel) 'delta_x' must be a number.`)
        }
        if (action.delta_y !== undefined && typeof action.delta_y !== 'number') {
          throw new Error(`Action ${index} (wheel) 'delta_y' must be a number.`)
        }
        break
      }
      case 'textbox': {
        if (!action.target) {
          throw new Error(`Action ${index} (textbox) needs 'target'.`)
        }
        if (typeof action.value !== 'string') {
          throw new Error(`Action ${index} (textbox) needs string 'value'.`)
        }
        if (action.timeout !== undefined && (typeof action.timeout !== 'number' || action.timeout < 0)) {
          throw new Error(`Action ${index} (textbox) 'timeout' must be a non-negative number.`)
        }
        break
      }
      case 'checkbox': {
        if (!action.target) {
          throw new Error(`Action ${index} (checkbox) needs 'target'.`)
        }
        if (typeof action.value !== 'boolean') {
          throw new Error(`Action ${index} (checkbox) needs boolean 'value'.`)
        }
        if (action.timeout !== undefined && (typeof action.timeout !== 'number' || action.timeout < 0)) {
          throw new Error(`Action ${index} (checkbox) 'timeout' must be a non-negative number.`)
        }
        break
      }
      case 'radio': {
        if (!action.target) {
          throw new Error(`Action ${index} (radio) needs 'target'.`)
        }
        if (action.value !== true) {
          throw new Error(`Action ${index} (radio) 'value' must be true.`)
        }
        if (action.timeout !== undefined && (typeof action.timeout !== 'number' || action.timeout < 0)) {
          throw new Error(`Action ${index} (radio) 'timeout' must be a non-negative number.`)
        }
        break
      }
      case 'combobox': {
        if (!action.target) {
          throw new Error(`Action ${index} (combobox) needs 'target'.`)
        }
        if (typeof action.value !== 'string' && !Array.isArray(action.value)) {
          throw new Error(`Action ${index} (combobox) 'value' must be a string or array of strings.`)
        }
        if (action.timeout !== undefined && (typeof action.timeout !== 'number' || action.timeout < 0)) {
          throw new Error(`Action ${index} (combobox) 'timeout' must be a non-negative number.`)
        }
        break
      }
      case 'press_key': {
        if (typeof action.key !== 'string' || action.key.length === 0) {
          throw new Error(`Action ${index} (press_key) needs non-empty 'key'.`)
        }
        break
      }
      case 'wait_time': {
        if (typeof action.milliseconds !== 'number' || action.milliseconds < 0 || Number.isNaN(action.milliseconds)) {
          throw new Error(`Action ${index} (wait_time) 'milliseconds' must be a non-negative number.`)
        }
        break
      }
      case 'wait_element': {
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
        break
      }
      case 'wait_load': {
        if (
          action.state !== 'domcontentloaded' &&
          action.state !== 'load' &&
          action.state !== 'networkidle'
        ) {
          throw new Error(`Action ${index} (wait_load) invalid 'state'.`)
        }
        if (action.timeout !== undefined && (typeof action.timeout !== 'number' || action.timeout < 0)) {
          throw new Error(`Action ${index} (wait_load) 'timeout' must be a non-negative number.`)
        }
        break
      }
      default: {
        const _exhaustiveCheck: never = action
        throw new Error(`Unsupported action: ${JSON.stringify(_exhaustiveCheck)}`)
      }
    }
  }
}

function resolveTargetElement(
  doc: Document,
  target: string,
  adaptive: boolean,
  storage?: StorageSystem,
): Element | null {
  const page = new Selector({
    root: doc.documentElement,
    url: doc.location?.href ?? 'default',
    adaptive,
    _storage: storage,
  })
  if (target.startsWith('//') || target.startsWith('.//')) {
    const res = page.xpath(target, { adaptive, autoSave: adaptive })
    return res.first?.rawNode ?? null
  }
  const res = page.css(target, { adaptive, autoSave: adaptive })
  return res.first?.rawNode ?? null
}

async function waitForDocumentLoad(
  doc: Document,
  state: 'domcontentloaded' | 'load' | 'networkidle',
  timeout = 30000,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) {
    throw signal.reason ?? new Error('Aborted')
  }

  const isDclReached = doc.readyState === 'interactive' || doc.readyState === 'complete'
  const isLoadReached = doc.readyState === 'complete'

  if (state === 'domcontentloaded' && isDclReached) {
    return
  }
  if (state === 'load' && isLoadReached) {
    return
  }
  if (state === 'networkidle' && isLoadReached) {
    if (timeout <= 0) return
    await new Promise<void>((resolve, reject) => {
      const waitMs = Math.min(500, timeout)
      const timer = setTimeout(resolve, waitMs)
      if (signal) {
        const onAbort = () => {
          clearTimeout(timer)
          reject(signal.reason ?? new Error('Aborted'))
        }
        signal.addEventListener('abort', onAbort, { once: true })
      }
    })
    return
  }

  if (timeout <= 0) {
    throw new Error(`Timeout waiting for load state '${state}'`)
  }

  const win = doc.defaultView ?? (typeof window !== 'undefined' ? window : null)

  await new Promise<void>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | null = null

    const cleanup = () => {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      win?.removeEventListener('load', onLoad)
      win?.removeEventListener('DOMContentLoaded', onDcl)
      doc.removeEventListener('DOMContentLoaded', onDcl)
      signal?.removeEventListener('abort', onAbort)
    }

    const onLoad = () => {
      cleanup()
      if (state === 'networkidle') {
        const idleTimer = setTimeout(resolve, Math.min(500, timeout))
        if (signal) {
          signal.addEventListener(
            'abort',
            () => {
              clearTimeout(idleTimer)
              reject(signal.reason ?? new Error('Aborted'))
            },
            { once: true },
          )
        }
      } else {
        resolve()
      }
    }

    const onDcl = () => {
      if (state === 'domcontentloaded') {
        cleanup()
        resolve()
      }
    }

    const onAbort = () => {
      cleanup()
      reject(signal?.reason ?? new Error('Aborted'))
    }

    if (timeout > 0 && timeout < Infinity) {
      timer = setTimeout(() => {
        cleanup()
        reject(new Error(`Timeout waiting for load state '${state}'`))
      }, timeout)
    }

    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true })
    }

    if (state === 'domcontentloaded') {
      doc.addEventListener('DOMContentLoaded', onDcl, { once: true })
      win?.addEventListener('DOMContentLoaded', onDcl, { once: true })
      win?.addEventListener('load', onDcl, { once: true })
    } else {
      win?.addEventListener('load', onLoad, { once: true })
    }
  })
}

async function waitForElementCondition(
  doc: Document,
  target: string,
  state: SelectorWaitState = 'visible',
  timeout = 30000,
  adaptive = false,
  storage?: StorageSystem,
  signal?: AbortSignal,
): Promise<Element | null> {
  if (signal?.aborted) {
    throw signal.reason ?? new Error('Aborted')
  }

  const check = (): { met: true; el: Element | null } | { met: false } => {
    const el = resolveTargetElement(doc, target, adaptive, storage)
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

  const start = Date.now()
  while (true) {
    if (signal?.aborted) {
      throw signal.reason ?? new Error('Aborted')
    }
    await new Promise((r) => setTimeout(r, 25))
    if (signal?.aborted) {
      throw signal.reason ?? new Error('Aborted')
    }
    const current = check()
    if (current.met) {
      return current.el
    }
    if (Date.now() - start >= timeout) {
      throw new Error(`Timeout waiting for '${target}' to reach state '${state}'`)
    }
  }
}

export interface RunBrowserActionsOptions {
  document?: Document
  adaptive?: boolean
  storage?: StorageSystem
  slowly?: boolean
  signal?: AbortSignal
}

export async function runBrowserActions(
  actions: BrowserAction[],
  options?: RunBrowserActionsOptions,
): Promise<void> {
  validateActions(actions)
  const doc = options?.document ?? document
  const adaptive = options?.adaptive ?? true
  const storage = options?.storage
  const slowly = options?.slowly ?? false

  for (let i = 0; i < actions.length; i++) {
    const index = i + 1
    const action = actions[i]
    const actionSignal =
      'signal' in action && action.signal instanceof AbortSignal
        ? action.signal
        : options?.signal

    try {
      if (actionSignal?.aborted) {
        throw actionSignal.reason ?? new Error('Aborted')
      }
      if (slowly && i > 0) {
        await new Promise((r) => setTimeout(r, 100))
      }
      switch (action.type) {
        case 'wait_time': {
          if (action.milliseconds <= 0) {
            break
          }
          await new Promise<void>((resolve, reject) => {
            let onAbort: (() => void) | undefined
            const timer = setTimeout(() => {
              if (actionSignal && onAbort) {
                actionSignal.removeEventListener('abort', onAbort)
              }
              resolve()
            }, action.milliseconds)
            if (actionSignal) {
              onAbort = () => {
                clearTimeout(timer)
                reject(actionSignal.reason ?? new Error('Aborted'))
              }
              actionSignal.addEventListener('abort', onAbort, { once: true })
            }
          })
          break
        }
        case 'wait_element':
          await waitForElementCondition(
            doc,
            action.target,
            action.state ?? 'visible',
            action.timeout ?? 30000,
            adaptive,
            storage,
            actionSignal,
          )
          break
        case 'wait_load':
          await waitForDocumentLoad(
            doc,
            action.state ?? 'load',
            action.timeout ?? 30000,
            actionSignal,
          )
          break
        case 'wheel': {
          const win = doc.defaultView ?? (typeof window !== 'undefined' ? window : null)
          win?.scrollBy(action.delta_x ?? 0, action.delta_y ?? 0)
          break
        }
        case 'press_key': {
          const active =
            doc.activeElement instanceof HTMLElement ? doc.activeElement : doc.body
          active.dispatchEvent(
            new KeyboardEvent('keydown', { key: action.key, bubbles: true }),
          )
          active.dispatchEvent(
            new KeyboardEvent('keyup', { key: action.key, bubbles: true }),
          )
          break
        }
        case 'move':
        case 'click': {
          let targetEl: Element | null = null
          if (action.target) {
            targetEl = resolveTargetElement(doc, action.target, adaptive, storage)
            if (!targetEl) {
              throw new Error(`Target '${action.target}' not found`)
            }
          } else if (action.x !== undefined && action.y !== undefined) {
            targetEl = doc.elementFromPoint(action.x, action.y)
          }
          if (targetEl) {
            if (action.type === 'move') {
              targetEl.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
              targetEl.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
            } else {
              const count = action.click_count ?? 1
              for (let c = 0; c < count; c++) {
                if (targetEl instanceof HTMLElement) {
                  targetEl.click()
                } else {
                  targetEl.dispatchEvent(new MouseEvent('click', { bubbles: true }))
                }
              }
              if (count === 2) {
                targetEl.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
              }
            }
          }
          break
        }
        case 'textbox': {
          const targetEl = resolveTargetElement(
            doc,
            action.target,
            adaptive,
            storage,
          )
          if (!targetEl) {
            throw new Error(`Target '${action.target}' not found`)
          }
          if (
            !(targetEl instanceof HTMLInputElement) &&
            !(targetEl instanceof HTMLTextAreaElement)
          ) {
            throw new TypeError(
              `Target '${action.target}' is not an HTMLInputElement or HTMLTextAreaElement`,
            )
          }
          targetEl.focus?.()
          const nextValue =
            (action.clear ?? true) ? action.value : (targetEl.value ?? '') + action.value
          setNativeInputValue(targetEl, nextValue)
          break
        }
        case 'checkbox':
        case 'radio': {
          const targetEl = resolveTargetElement(
            doc,
            action.target,
            adaptive,
            storage,
          )
          if (!targetEl) {
            throw new Error(`Target '${action.target}' not found`)
          }
          if (!(targetEl instanceof HTMLInputElement)) {
            throw new TypeError(`Target '${action.target}' is not an HTMLInputElement`)
          }
          if (targetEl.checked !== action.value) {
            setNativeCheckboxValue(targetEl, action.value)
          }
          break
        }
        case 'combobox': {
          const targetEl = resolveTargetElement(
            doc,
            action.target,
            adaptive,
            storage,
          )
          if (!targetEl) {
            throw new Error(`Target '${action.target}' not found`)
          }
          if (!(targetEl instanceof HTMLSelectElement)) {
            throw new TypeError(`Target '${action.target}' is not an HTMLSelectElement`)
          }
          const labels = Array.isArray(action.value) ? action.value : [action.value]
          const labelSet = new Set(labels)
          for (const opt of Array.from(targetEl.options)) {
            opt.selected =
              labelSet.has(opt.label) ||
              labelSet.has(opt.text.trim()) ||
              labelSet.has(opt.value)
          }
          targetEl.dispatchEvent(new Event('input', { bubbles: true }))
          targetEl.dispatchEvent(new Event('change', { bubbles: true }))
          break
        }
        default: {
          const _exhaustiveCheck: never = action
          throw new Error(`Unsupported action: ${JSON.stringify(_exhaustiveCheck)}`)
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(`Action ${index} (${action.type}) failed: ${message}`)
    }
  }
}
