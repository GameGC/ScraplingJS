import type {
  CapturedElementInfo,
  PagePersistenceWatcherOptions,
  RelocationCallback,
} from '../types'
import type { Selector } from '../parser/selector'
import type { Selectors } from '../parser/selectors'
import { htmlToMarkdown } from '../snapshot/sanitizer'
import {
  type ElementFilter,
  PagePersistenceManager,
  type PagePersistenceManagerOptions,
  type WaitForElementOptions,
} from './page-persistence'
import {
  isElementVisible,
  setNativeInputValue,
  setNativeCheckboxValue,
} from '../core/utils'


export interface ScopedScrapling {
  <T extends HTMLElement = HTMLElement>(
    query: string | readonly string[],
    filterOrKey?: ElementFilter<T> | string,
    key?: string,
  ): T | null
  all<T extends HTMLElement = HTMLElement>(
    query: string | readonly string[],
    filterOrKey?: ElementFilter<T> | string,
    key?: string,
  ): T[]
  first<T extends HTMLElement = HTMLElement>(
    queries: readonly string[],
    filterOrKey?: ElementFilter<T> | string,
    key?: string,
  ): T | null
  waitFor<T extends HTMLElement = HTMLElement>(
    query: string | readonly string[],
    optionsOrTimeout?: number | Omit<WaitForElementOptions<T>, 'root'>,
  ): Promise<T | null>
  attr(
    query: string | readonly string[],
    attributeName: string,
    filterOrKey?: ElementFilter<HTMLElement> | string,
    key?: string,
  ): string | null
  text(
    query: string | readonly string[],
    filterOrKey?: ElementFilter<HTMLElement> | string,
    key?: string,
  ): string
  texts(
    query: string | readonly string[],
    filterOrKey?: ElementFilter<HTMLElement> | string,
    key?: string,
  ): string[]
  click(
    query: string | readonly string[],
    filterOrKey?: ElementFilter<HTMLElement> | string,
    key?: string,
  ): boolean
  fill(
    query: string | readonly string[],
    value: string,
    filterOrKey?: ElementFilter<HTMLElement> | string,
    key?: string,
  ): boolean
  check(
    query: string | readonly string[],
    checked?: boolean,
    filterOrKey?: ElementFilter<HTMLElement> | string,
    key?: string,
  ): boolean
}

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
  markdown(htmlOrElement: string | Element | null | undefined): string
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

function parseQueryArguments<T extends HTMLElement = HTMLElement>(
  query: string | readonly string[],
  arg1?: Element | Document | ElementFilter<T> | string,
  arg2?: ElementFilter<T> | string,
  arg3?: string,
): {
  root?: Element | Document
  filter?: ElementFilter<T>
  identifier: string
} {
  const defaultKey =
    typeof query === 'string' ? query : (query[0] ?? 'default')

  let root: Element | Document | undefined
  let filter: ElementFilter<T> | undefined
  let identifier = defaultKey

  if (typeof arg1 === 'function') {
    filter = arg1 as ElementFilter<T>
    if (typeof arg2 === 'string') {
      identifier = arg2
    }
  } else if (typeof arg1 === 'object' && arg1 !== null) {
    root = arg1 as Element | Document
    if (typeof arg2 === 'function') {
      filter = arg2 as ElementFilter<T>
      if (typeof arg3 === 'string') {
        identifier = arg3
      }
    } else if (typeof arg2 === 'string') {
      identifier = arg2
    }
  } else if (typeof arg1 === 'string') {
    identifier = arg1
  }

  return { root, filter, identifier }
}

export function createScrapling(
  options?: PagePersistenceManagerOptions,
): EasyScrapling {
  let currentOptions: PagePersistenceManagerOptions | undefined = options
  let instance: PagePersistenceManager | null = null

  const getManager = (): PagePersistenceManager => {
    if (!instance) {
      instance = new PagePersistenceManager(currentOptions)
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
      void instance.destroy()
      instance = null
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
    const scoped = (<T extends HTMLElement = HTMLElement>(
      query: string | readonly string[],
      filterOrKey?: ElementFilter<T> | string,
      key?: string,
    ): T | null => {
      return fn<T>(query, root, filterOrKey, key)
    }) as ScopedScrapling

    scoped.all = <T extends HTMLElement = HTMLElement>(
      query: string | readonly string[],
      filterOrKey?: ElementFilter<T> | string,
      key?: string,
    ): T[] => fn.all<T>(query, root, filterOrKey, key)

    scoped.first = <T extends HTMLElement = HTMLElement>(
      queries: readonly string[],
      filterOrKey?: ElementFilter<T> | string,
      key?: string,
    ): T | null => fn.first<T>(queries, root, filterOrKey, key)

    scoped.waitFor = <T extends HTMLElement = HTMLElement>(
      query: string | readonly string[],
      optionsOrTimeout?: number | Omit<WaitForElementOptions<T>, 'root'>,
    ): Promise<T | null> => {
      const opts: WaitForElementOptions<T> =
        typeof optionsOrTimeout === 'number'
          ? { timeout: optionsOrTimeout, root }
          : { ...(optionsOrTimeout ?? {}), root }
      return fn.waitFor<T>(query, opts)
    }

    scoped.attr = (
      query: string | readonly string[],
      attributeName: string,
      filterOrKey?: ElementFilter<HTMLElement> | string,
      key?: string,
    ): string | null => fn.attr(query, attributeName, root, filterOrKey, key)

    scoped.text = (
      query: string | readonly string[],
      filterOrKey?: ElementFilter<HTMLElement> | string,
      key?: string,
    ): string => fn.text(query, root, filterOrKey, key)

    scoped.texts = (
      query: string | readonly string[],
      filterOrKey?: ElementFilter<HTMLElement> | string,
      key?: string,
    ): string[] => fn.texts(query, root, filterOrKey, key)

    scoped.click = (
      query: string | readonly string[],
      filterOrKey?: ElementFilter<HTMLElement> | string,
      key?: string,
    ): boolean => fn.click(query, root, filterOrKey, key)

    scoped.fill = (
      query: string | readonly string[],
      value: string,
      filterOrKey?: ElementFilter<HTMLElement> | string,
      key?: string,
    ): boolean => fn.fill(query, value, root, filterOrKey, key)

    scoped.check = (
      query: string | readonly string[],
      checked = true,
      filterOrKey?: ElementFilter<HTMLElement> | string,
      key?: string,
    ): boolean => fn.check(query, checked, root, filterOrKey, key)

    return scoped
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
    return getManager().onRelocate(callback)
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

  fn.markdown = (htmlOrElement: string | Element | null | undefined): string => {
    if (!htmlOrElement) return ''
    return htmlToMarkdown(htmlOrElement)
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
    if (
      !(typeof HTMLInputElement !== 'undefined' && el instanceof HTMLInputElement) &&
      !(typeof HTMLTextAreaElement !== 'undefined' && el instanceof HTMLTextAreaElement)
    ) {
      return false
    }
    el.focus()
    setNativeInputValue(el, value)
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
    if (!(typeof HTMLInputElement !== 'undefined' && el instanceof HTMLInputElement)) {
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
