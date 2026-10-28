import type { AdaptiveQueryOptions, RegexExtractOptions } from '../types'
import { TextHandler, TextHandlers } from '../core/custom-types'
import { flatten } from '../core/utils'
import type { Selector } from './selector'

export class Selectors extends Array<Selector> {
  constructor(items?: Iterable<Selector> | number) {
    if (typeof items === 'number') {
      super(items)
    } else if (items) {
      super(...Array.from(items))
    } else {
      super()
    }
    Object.setPrototypeOf(this, Selectors.prototype)
  }

  override slice(start?: number, end?: number): Selectors {
    return new Selectors(super.slice(start, end))
  }

  xpath(
    selector: string,
    identifierOrOptions: string | AdaptiveQueryOptions = '',
    autoSave = false,
    percentage = 40,
    variables?: Record<string, string | number>,
  ): Selectors {
    let identifier = ''
    let isAdaptive: boolean | undefined
    let isAutoSave = autoSave
    let minPercentage = percentage
    let vars = variables

    if (typeof identifierOrOptions === 'object' && identifierOrOptions !== null) {
      identifier = identifierOrOptions.identifier ?? ''
      isAdaptive = identifierOrOptions.adaptive
      isAutoSave = identifierOrOptions.autoSave ?? identifierOrOptions.auto_save ?? false
      minPercentage = identifierOrOptions.percentage ?? 40
      vars = identifierOrOptions.variables ?? variables
    } else {
      identifier = identifierOrOptions
    }

    const nested = Array.from(this, (n) =>
      n.xpath(
        selector,
        identifier || selector,
        isAdaptive,
        isAutoSave,
        minPercentage,
        vars,
      ),
    )
    return new Selectors(flatten(nested))
  }

  css(
    selector: string,
    identifierOrOptions: string | AdaptiveQueryOptions = '',
    autoSave = false,
    percentage = 40,
    variables?: Record<string, string | number>,
  ): Selectors {
    let identifier = ''
    let isAdaptive: boolean | undefined
    let isAutoSave = autoSave
    let minPercentage = percentage
    let vars = variables

    if (typeof identifierOrOptions === 'object' && identifierOrOptions !== null) {
      identifier = identifierOrOptions.identifier ?? ''
      isAdaptive = identifierOrOptions.adaptive
      isAutoSave = identifierOrOptions.autoSave ?? identifierOrOptions.auto_save ?? false
      minPercentage = identifierOrOptions.percentage ?? 40
      vars = identifierOrOptions.variables ?? variables
    } else {
      identifier = identifierOrOptions
    }

    const nested = Array.from(this, (n) =>
      n.css(
        selector,
        identifier || selector,
        isAdaptive,
        isAutoSave,
        minPercentage,
        vars,
      ),
    )
    return new Selectors(flatten(nested))
  }

  re(
    regex: string | RegExp,
    optionsOrReplaceEntities?: RegexExtractOptions | boolean,
    cleanMatch = false,
    caseSensitive = true,
  ): TextHandlers {
    const nested = Array.from(this, (n) =>
      n.re(regex, optionsOrReplaceEntities, cleanMatch, caseSensitive),
    )
    return new TextHandlers(flatten(nested))
  }

  reFirst<T = null>(
    regex: string | RegExp,
    defaultValue: T = null as unknown as T,
    optionsOrReplaceEntities?: RegexExtractOptions | boolean,
    cleanMatch = false,
    caseSensitive = true,
  ): TextHandler | T {
    for (const n of this) {
      const matches = n.re(regex, optionsOrReplaceEntities, cleanMatch, caseSensitive)
      if (matches.length > 0) {
        return matches[0]
      }
    }
    return defaultValue
  }

  re_first<T = null>(
    regex: string | RegExp,
    defaultValue: T = null as unknown as T,
    optionsOrReplaceEntities?: RegexExtractOptions | boolean,
    cleanMatch = false,
    caseSensitive = true,
  ): TextHandler | T {
    return this.reFirst(regex, defaultValue, optionsOrReplaceEntities, cleanMatch, caseSensitive)
  }

  search(func: (element: Selector) => boolean): Selector | null {
    for (const element of this) {
      if (func(element)) {
        return element
      }
    }
    return null
  }

  override filter(
    predicate: (value: Selector, index: number, array: Selector[]) => unknown,
    thisArg?: unknown,
  ): Selectors {
    return new Selectors(super.filter(predicate, thisArg))
  }

  get<T = null>(defaultValue: T = null as unknown as T): TextHandler | T {
    return this.length > 0 ? this[0].get() : defaultValue
  }

  getall(): TextHandlers {
    return new TextHandlers(Array.from(this, (x) => x.get()))
  }

  extract(): TextHandlers {
    return this.getall()
  }

  extractFirst<T = null>(defaultValue: T = null as unknown as T): TextHandler | T {
    return this.get(defaultValue)
  }

  extract_first<T = null>(defaultValue: T = null as unknown as T): TextHandler | T {
    return this.get(defaultValue)
  }

  get first(): Selector | null {
    return this.length > 0 ? this[0] : null
  }

  get last(): Selector | null {
    return this.length > 0 ? this[this.length - 1] : null
  }
}

export const Adaptors = Selectors
