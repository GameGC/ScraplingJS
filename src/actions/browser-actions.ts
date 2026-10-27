import type { BrowserAction, SelectorWaitState, StorageSystem } from '../types'
import { Selector } from '../parser/selector'

export function validateActions(actions: BrowserAction[]): void {
  for (let i = 0; i < actions.length; i++) {
    const index = i + 1
    const action = actions[i]
    if (action.type === 'move' || action.type === 'click') {
      const hasTarget = action.target !== undefined && action.target !== null
      const hasX = action.x !== undefined && action.x !== null
      const hasY = action.y !== undefined && action.y !== null
      if (hasTarget === hasX || hasX !== hasY) {
        throw new Error(
          `Action ${index} (${action.type}) needs 'target' or both 'x' and 'y', not both.`,
        )
      }
    }
    if (
      (action.type === 'textbox' ||
        action.type === 'checkbox' ||
        action.type === 'radio' ||
        action.type === 'combobox') &&
      (action.target === undefined || action.target === null || action.target === '')
    ) {
      throw new Error(`Action ${index} (${action.type}) needs 'target'.`)
    }
  }
}

function isElementVisible(el: Element): boolean {
  const htmlEl = el as HTMLElement
  const style = window.getComputedStyle(htmlEl)
  if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
    return false
  }
  const rect = htmlEl.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
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

async function waitForElementCondition(
  doc: Document,
  target: string,
  state: SelectorWaitState = 'visible',
  timeout = 30000,
  adaptive = false,
  storage?: StorageSystem,
): Promise<Element | null> {
  const start = Date.now()
  while (true) {
    const el = resolveTargetElement(doc, target, adaptive, storage)
    if (state === 'attached' && el) return el
    if (state === 'detached' && !el) return null
    if (state === 'visible' && el && isElementVisible(el)) return el
    if (state === 'hidden' && (!el || !isElementVisible(el))) return el
    if (timeout > 0 && Date.now() - start >= timeout) {
      throw new Error(`Timeout waiting for '${target}' to reach state '${state}'`)
    }
    await new Promise((r) => setTimeout(r, 25))
  }
}

export interface RunBrowserActionsOptions {
  document?: Document
  adaptive?: boolean
  storage?: StorageSystem
  slowly?: boolean
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
    try {
      if (slowly && i > 0) {
        await new Promise((r) => setTimeout(r, 100))
      }
      switch (action.type) {
        case 'wait_time':
          await new Promise((r) => setTimeout(r, action.milliseconds))
          break
        case 'wait_element':
          await waitForElementCondition(
            doc,
            action.target,
            action.state ?? 'visible',
            action.timeout ?? 30000,
            adaptive,
            storage,
          )
          break
        case 'wait_load':
          if (doc.readyState !== 'complete') {
            await new Promise<void>((resolve) => {
              window.addEventListener('load', () => resolve(), { once: true })
            })
          }
          break
        case 'wheel':
          window.scrollBy(action.delta_x ?? 0, action.delta_y ?? 0)
          break
        case 'press_key': {
          const active = (doc.activeElement as HTMLElement) ?? doc.body
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
                ;(targetEl as HTMLElement).click?.()
              }
              if (count === 2) {
                targetEl.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
              }
            }
          }
          break
        }
        case 'textbox': {
          const el = resolveTargetElement(
            doc,
            action.target,
            adaptive,
            storage,
          ) as HTMLInputElement | HTMLTextAreaElement | null
          if (!el) {
            throw new Error(`Target '${action.target}' not found`)
          }
          el.focus?.()
          if (action.clear ?? true) {
            el.value = action.value
          } else {
            el.value = (el.value ?? '') + action.value
          }
          el.dispatchEvent(new Event('input', { bubbles: true }))
          el.dispatchEvent(new Event('change', { bubbles: true }))
          break
        }
        case 'checkbox':
        case 'radio': {
          const el = resolveTargetElement(
            doc,
            action.target,
            adaptive,
            storage,
          ) as HTMLInputElement | null
          if (!el) {
            throw new Error(`Target '${action.target}' not found`)
          }
          if (el.checked !== action.value) {
            el.checked = action.value
            el.dispatchEvent(new Event('input', { bubbles: true }))
            el.dispatchEvent(new Event('change', { bubbles: true }))
          }
          break
        }
        case 'combobox': {
          const el = resolveTargetElement(
            doc,
            action.target,
            adaptive,
            storage,
          ) as HTMLSelectElement | null
          if (!el) {
            throw new Error(`Target '${action.target}' not found`)
          }
          const labels = Array.isArray(action.value) ? action.value : [action.value]
          const labelSet = new Set(labels)
          for (const opt of Array.from(el.options)) {
            opt.selected =
              labelSet.has(opt.label) ||
              labelSet.has(opt.text.trim()) ||
              labelSet.has(opt.value)
          }
          el.dispatchEvent(new Event('input', { bubbles: true }))
          el.dispatchEvent(new Event('change', { bubbles: true }))
          break
        }
      }
    } catch (err: any) {
      throw new Error(`Action ${index} (${action.type}) failed: ${err?.message ?? err}`)
    }
  }
}
