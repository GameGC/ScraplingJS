import type { ElementFilter, WaitForElementOptions } from './query-parser'
import type { EasyScrapling } from './easy'

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

export function createScopedScrapling(
  fn: EasyScrapling,
  root: Element | Document,
): ScopedScrapling {
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
