import type {
  CapturedElementInfo,
  PagePersistenceWatcherOptions,
  RelocationCallback,
} from '../types'
import type { Selector } from '../parser/selector'
import type { Selectors } from '../parser/selectors'
import {
  type ElementFilter,
  PagePersistenceManager,
  type PagePersistenceManagerOptions,
  type WaitForElementOptions,
  parseQueryArguments,
} from './page-persistence'
import {
  isElementVisible,
  isInputElement,
  isTextAreaElement,
  setNativeInputValue,
  setNativeCheckboxValue,
} from '../core/utils'
import { createScopedScrapling, type ScopedScrapling } from './scoped'

export type { ScopedScrapling } from './scoped'

export interface EasyScrapling {
  <T extends HTMLElement = HTMLElement>(
    query: string | readonly string[],
    rootOrFilterOrKey?: Element | Document | ElementFilter<T> | string,
    filterOrKey?: ElementFilter<T> | string,
    key?: string,
  ): T | null
  all<T extends HTMLElement = HTMLElement>(
    query: string | readonly string[],
    rootOrFilterOrKey?: Element | Document | ElementFilter<T> | string,
    filterOrKey?: ElementFilter<T> | string,
    key?: string,
  ): T[]
  first<T extends HTMLElement = HTMLElement>(
    queries: readonly string[],
    rootOrFilterOrKey?: Element | Document | ElementFilter<T> | string,
    filterOrKey?: ElementFilter<T> | string,
    key?: string,
  ): T | null
  in(root: Element | Document): ScopedScrapling
  select<T extends HTMLElement = HTMLElement>(
    query: string | readonly string[],
    rootOrFilterOrKey?: Element | Document | ElementFilter<T> | string,
    filterOrKey?: ElementFilter<T> | string,
    key?: string,
  ): Selector | null
  selectAll<T extends HTMLElement = HTMLElement>(
    query: string | readonly string[],
    rootOrFilterOrKey?: Element | Document | ElementFilter<T> | string,
    filterOrKey?: ElementFilter<T> | string,
    key?: string,
  ): Selectors
  onRelocate(callback: RelocationCallback): () => void
  watch(
    query: string,
    onResolved: (element: HTMLElement, relocated: boolean, score?: number) => void,
    key?: string,
  ): () => void
  watch(options: PagePersistenceWatcherOptions): () => void
  waitFor<T extends HTMLElement = HTMLElement>(
    query: string | readonly string[],
    optionsOrTimeout?: number | WaitForElementOptions<T>,
  ): Promise<T | null>
  waitUntil<R>(
    condition: () => R | null | undefined | false,
    timeoutMs?: number,
    pollMs?: number,
  ): Promise<R | null>
  isVisible(element: Element | null | undefined): boolean
  remember(element: Element, key?: string): string
  capture(element: Element, key?: string): CapturedElementInfo
  restore(
    key: string,
    percentage?: number,
    root?: Element | Document,
    filter?: ElementFilter<HTMLElement>,
  ): HTMLElement | null
  attr(
    query: string | readonly string[],
    attributeName: string,
    rootOrFilterOrKey?: Element | Document | ElementFilter<HTMLElement> | string,
    filterOrKey?: ElementFilter<HTMLElement> | string,
    key?: string,
  ): string | null
  click(
    query: string | readonly string[],
    rootOrFilterOrKey?: Element | Document | ElementFilter<HTMLElement> | string,
    filterOrKey?: ElementFilter<HTMLElement> | string,
    key?: string,
  ): boolean
  fill(
    query: string | readonly string[],
    value: string,
    rootOrFilterOrKey?: Element | Document | ElementFilter<HTMLElement> | string,
    filterOrKey?: ElementFilter<HTMLElement> | string,
    key?: string,
  ): boolean
  check(
    query: string | readonly string[],
    checked?: boolean,
    rootOrFilterOrKey?: Element | Document | ElementFilter<HTMLElement> | string,
    filterOrKey?: ElementFilter<HTMLElement> | string,
    key?: string,
  ): boolean
  text(
    query: string | readonly string[],
    rootOrFilterOrKey?: Element | Document | ElementFilter<HTMLElement> | string,
    filterOrKey?: ElementFilter<HTMLElement> | string,
    key?: string,
  ): string
  texts(
    query: string | readonly string[],
    rootOrFilterOrKey?: Element | Document | ElementFilter<HTMLElement> | string,
    filterOrKey?: ElementFilter<HTMLElement> | string,
    key?: string,
  ): string[]
  configure(options: PagePersistenceManagerOptions): EasyScrapling
  readonly page: Selector
  readonly manager: PagePersistenceManager
}

export function createScrapling(
  options?: PagePersistenceManagerOptions,
): EasyScrapling {
  let currentOptions: PagePersistenceManagerOptions | undefined = options
  let instance: PagePersistenceManager | null = null
  const relocateListeners = new Set<RelocationCallback>()

  const getManager = (): PagePersistenceManager => {
    if (!instance) {
      instance = new PagePersistenceManager(currentOptions)
      for (const listener of relocateListeners) {
        instance.onRelocate(listener)
      }
    }
    return instance
  }

  const fn = (<T extends HTMLElement = HTMLElement>(
    query: string | readonly string[],
    rootOrFilterOrKey?: Element | Document | ElementFilter<T> | string,
    filterOrKey?: ElementFilter<T> | string,
    key?: string,
  ): T | null => {
    return getManager().find<T>(query, rootOrFilterOrKey, filterOrKey, key)
  }) as EasyScrapling

  fn.configure = (newOptions: PagePersistenceManagerOptions): EasyScrapling => {
    currentOptions = { ...(currentOptions ?? {}), ...newOptions }
    if (instance) {
      const previous = instance
      instance = null
      void previous.destroy().catch((err: unknown) => {
        const error = err instanceof Error ? err : new Error(String(err))
        currentOptions?.onError?.(error, { operation: 'close' })
      })
    }
    return fn
  }

  fn.all = <T extends HTMLElement = HTMLElement>(
    query: string | readonly string[],
    rootOrFilterOrKey?: Element | Document | ElementFilter<T> | string,
    filterOrKey?: ElementFilter<T> | string,
    key?: string,
  ): T[] => {
    return getManager().findAll<T>(query, rootOrFilterOrKey, filterOrKey, key)
  }

  fn.first = <T extends HTMLElement = HTMLElement>(
    queries: readonly string[],
    rootOrFilterOrKey?: Element | Document | ElementFilter<T> | string,
    filterOrKey?: ElementFilter<T> | string,
    key?: string,
  ): T | null => {
    return getManager().find<T>(queries, rootOrFilterOrKey, filterOrKey, key)
  }

  fn.in = (root: Element | Document): ScopedScrapling => {
    return createScopedScrapling(fn, root)
  }

  fn.select = <T extends HTMLElement = HTMLElement>(
    query: string | readonly string[],
    rootOrFilterOrKey?: Element | Document | ElementFilter<T> | string,
    filterOrKey?: ElementFilter<T> | string,
    key?: string,
  ): Selector | null => {
    const { root, filter, identifier } = parseQueryArguments<T>(
      query,
      rootOrFilterOrKey,
      filterOrKey,
      key,
    )
    return getManager().resolve<T>(query, {
      identifier,
      root,
      filter,
      multiple: false,
    }).first
  }

  fn.selectAll = <T extends HTMLElement = HTMLElement>(
    query: string | readonly string[],
    rootOrFilterOrKey?: Element | Document | ElementFilter<T> | string,
    filterOrKey?: ElementFilter<T> | string,
    key?: string,
  ): Selectors => {
    const { root, filter, identifier } = parseQueryArguments<T>(
      query,
      rootOrFilterOrKey,
      filterOrKey,
      key,
    )
    return getManager().resolve<T>(query, {
      identifier,
      root,
      filter,
      multiple: true,
    })
  }

  fn.onRelocate = (callback: RelocationCallback): (() => void) => {
    relocateListeners.add(callback)
    const unsubscribe = getManager().onRelocate(callback)
    return () => {
      relocateListeners.delete(callback)
      unsubscribe()
    }
  }

  fn.watch = ((
    queryOrOptions: string | PagePersistenceWatcherOptions,
    onResolved?: (element: HTMLElement, relocated: boolean, score?: number) => void,
    key?: string,
  ): (() => void) => {
    if (typeof queryOrOptions === 'string') {
      return getManager().watch(queryOrOptions, onResolved!, key)
    }
    return getManager().watchElement(queryOrOptions)
  }) as EasyScrapling['watch']

  fn.waitFor = <T extends HTMLElement = HTMLElement>(
    query: string | readonly string[],
    optionsOrTimeout?: number | WaitForElementOptions<T>,
  ): Promise<T | null> => {
    return getManager().waitFor<T>(query, optionsOrTimeout)
  }

  fn.waitUntil = <R>(
    condition: () => R | null | undefined | false,
    timeoutMs = 10000,
    pollMs = 200,
  ): Promise<R | null> => {
    return getManager().waitUntil<R>(condition, timeoutMs, pollMs)
  }

  fn.isVisible = (element: Element | null | undefined): boolean => {
    return isElementVisible(element)
  }

  fn.remember = (element: Element, key?: string): string => {
    return getManager().remember(element, key)
  }

  fn.capture = (element: Element, key?: string): CapturedElementInfo => {
    return getManager().captureElement(element, key)
  }

  fn.restore = (
    key: string,
    percentage?: number,
    root?: Element | Document,
    filter?: ElementFilter<HTMLElement>,
  ): HTMLElement | null => {
    return getManager().restore(key, percentage, root, filter)
  }

  fn.attr = (
    query: string | readonly string[],
    attributeName: string,
    rootOrFilterOrKey?: Element | Document | ElementFilter<HTMLElement> | string,
    filterOrKey?: ElementFilter<HTMLElement> | string,
    key?: string,
  ): string | null => {
    const el = getManager().find(query, rootOrFilterOrKey, filterOrKey, key)
    if (!el) return null
    const attrVal = el.getAttribute(attributeName)
    if (attrVal !== null) return attrVal
    const propVal = Reflect.get(el, attributeName)
    return typeof propVal === 'string' && propVal.length > 0 ? propVal : null
  }

  fn.click = (
    query: string | readonly string[],
    rootOrFilterOrKey?: Element | Document | ElementFilter<HTMLElement> | string,
    filterOrKey?: ElementFilter<HTMLElement> | string,
    key?: string,
  ): boolean => {
    const el = getManager().find(query, rootOrFilterOrKey, filterOrKey, key)
    if (!el) return false
    el.click()
    return true
  }

  fn.fill = (
    query: string | readonly string[],
    value: string,
    rootOrFilterOrKey?: Element | Document | ElementFilter<HTMLElement> | string,
    filterOrKey?: ElementFilter<HTMLElement> | string,
    key?: string,
  ): boolean => {
    const el = getManager().find(query, rootOrFilterOrKey, filterOrKey, key)
    if (!el) return false
    if (isInputElement(el) || isTextAreaElement(el)) {
      el.focus()
      setNativeInputValue(el, value)
      return true
    }
    const editable =
      el.isContentEditable ||
      (el.hasAttribute('contenteditable') &&
        el.getAttribute('contenteditable')?.toLowerCase() !== 'false')
    if (!editable) {
      return false
    }
    el.focus()
    el.textContent = value
    const EventCtor =
      el.ownerDocument?.defaultView?.Event ??
      (typeof Event !== 'undefined' ? Event : undefined)
    if (EventCtor) {
      el.dispatchEvent(new EventCtor('input', { bubbles: true }))
      el.dispatchEvent(new EventCtor('change', { bubbles: true }))
    }
    return true
  }

  fn.check = (
    query: string | readonly string[],
    checked = true,
    rootOrFilterOrKey?: Element | Document | ElementFilter<HTMLElement> | string,
    filterOrKey?: ElementFilter<HTMLElement> | string,
    key?: string,
  ): boolean => {
    const el = getManager().find(query, rootOrFilterOrKey, filterOrKey, key)
    if (!el) return false
    if (!isInputElement(el)) {
      return false
    }
    if (el.checked !== checked) {
      setNativeCheckboxValue(el, checked)
    }
    return true
  }

  fn.text = (
    query: string | readonly string[],
    rootOrFilterOrKey?: Element | Document | ElementFilter<HTMLElement> | string,
    filterOrKey?: ElementFilter<HTMLElement> | string,
    key?: string,
  ): string => {
    const sel = fn.select(query, rootOrFilterOrKey, filterOrKey, key)
    if (!sel) return ''
    return String(sel.getAllText({ strip: true }))
  }

  fn.texts = (
    query: string | readonly string[],
    rootOrFilterOrKey?: Element | Document | ElementFilter<HTMLElement> | string,
    filterOrKey?: ElementFilter<HTMLElement> | string,
    key?: string,
  ): string[] => {
    const sels = fn.selectAll(query, rootOrFilterOrKey, filterOrKey, key)
    return sels.map((s) => String(s.getAllText({ strip: true })))
  }

  Object.defineProperty(fn, 'page', {
    get() {
      return getManager().page
    },
  })

  Object.defineProperty(fn, 'manager', {
    get() {
      return getManager()
    },
  })

  return fn
}

export const scrapling: EasyScrapling = createScrapling()
export const persist: EasyScrapling = scrapling
