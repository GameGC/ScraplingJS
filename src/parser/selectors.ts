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
    variables?: Record<string, any>,
  ): Selectors {
    let identifier = ''
    let isAutoSave = autoSave
    let minPercentage = percentage
    let vars = variables

    if (typeof identifierOrOptions === 'object' && identifierOrOptions !== null) {
      identifier = identifierOrOptions.identifier ?? ''
      isAutoSave = identifierOrOptions.autoSave ?? identifierOrOptions.auto_save ?? false
      minPercentage = identifierOrOptions.percentage ?? 40
      vars = identifierOrOptions.variables
    } else {
      identifier = identifierOrOptions
    }

    const nested = Array.from(this, (n) =>
      n.xpath(selector, identifier || selector, false, isAutoSave, minPercentage, vars),
    )
    return new Selectors(flatten(nested))
  }

  css(
    selector: string,
    identifierOrOptions: string | AdaptiveQueryOptions = '',
    autoSave = false,
    percentage = 40,
  ): Selectors {
    let identifier = ''
    let isAutoSave = autoSave
    let minPercentage = percentage

    if (typeof identifierOrOptions === 'object' && identifierOrOptions !== null) {
      identifier = identifierOrOptions.identifier ?? ''
      isAutoSave = identifierOrOptions.autoSave ?? identifierOrOptions.auto_save ?? false
      minPercentage = identifierOrOptions.percentage ?? 40
    } else {
      identifier = identifierOrOptions
    }

    const nested = Array.from(this, (n) =>
      n.css(selector, identifier || selector, false, isAutoSave, minPercentage),
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

  reFirst(
    regex: string | RegExp,
    defaultValue: any = null,
    optionsOrReplaceEntities?: RegexExtractOptions | boolean,
    cleanMatch = false,
    caseSensitive = true,
  ): TextHandler | any {
    for (const n of this) {
      const matches = n.re(regex, optionsOrReplaceEntities, cleanMatch, caseSensitive)
      if (matches.length > 0) {
        return matches[0]
      }
    }
    return defaultValue
  }

  re_first(
    regex: string | RegExp,
    defaultValue: any = null,
    optionsOrReplaceEntities?: RegexExtractOptions | boolean,
    cleanMatch = false,
    caseSensitive = true,
  ): TextHandler | any {
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
    thisArg?: any,
  ): Selectors {
    return new Selectors(super.filter(predicate, thisArg))
  }

  get(defaultValue: any = null): TextHandler | any {
    return this.length > 0 ? this[0].get() : defaultValue
  }

  getall(): TextHandlers {
    return new TextHandlers(Array.from(this, (x) => x.get()))
  }

  extract(): TextHandlers {
    return this.getall()
  }

  extractFirst(defaultValue: any = null): TextHandler | any {
    return this.get(defaultValue)
  }

  extract_first(defaultValue: any = null): TextHandler | any {
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
