import type { RegexExtractOptions } from '../types'
import { cleanText, flatten, replaceEntities } from './utils'

export class SelectorSyntaxError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SelectorSyntaxError'
  }
}

export class SelectorError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SelectorError'
  }
}

function escapeRegExpChars(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeRegexOptions(
  optionsOrReplaceEntities?: RegexExtractOptions | boolean,
  cleanMatch = false,
  caseSensitive = true,
  checkMatch = false,
): {
  replaceEntities: boolean
  cleanMatch: boolean
  caseSensitive: boolean
  checkMatch: boolean
} {
  if (typeof optionsOrReplaceEntities === 'object' && optionsOrReplaceEntities !== null) {
    return {
      replaceEntities:
        optionsOrReplaceEntities.replaceEntities ??
        optionsOrReplaceEntities.replace_entities ??
        true,
      cleanMatch:
        optionsOrReplaceEntities.cleanMatch ??
        optionsOrReplaceEntities.clean_match ??
        false,
      caseSensitive:
        optionsOrReplaceEntities.caseSensitive ??
        optionsOrReplaceEntities.case_sensitive ??
        true,
      checkMatch:
        optionsOrReplaceEntities.checkMatch ??
        optionsOrReplaceEntities.check_match ??
        false,
    }
  }
  return {
    replaceEntities: optionsOrReplaceEntities ?? true,
    cleanMatch,
    caseSensitive,
    checkMatch,
  }
}

export class TextHandler extends String {
  constructor(value: any = '') {
    super(value == null ? '' : String(value))
  }

  strip(chars?: string): TextHandler {
    const raw = this.toString()
    if (!chars) {
      return new TextHandler(raw.trim())
    }
    const escaped = escapeRegExpChars(chars)
    const re = new RegExp(`^[${escaped}]+|[${escaped}]+$`, 'g')
    return new TextHandler(raw.replace(re, ''))
  }

  lstrip(chars?: string): TextHandler {
    const raw = this.toString()
    if (!chars) {
      return new TextHandler(raw.trimStart())
    }
    const escaped = escapeRegExpChars(chars)
    const re = new RegExp(`^[${escaped}]+`, 'g')
    return new TextHandler(raw.replace(re, ''))
  }

  rstrip(chars?: string): TextHandler {
    const raw = this.toString()
    if (!chars) {
      return new TextHandler(raw.trimEnd())
    }
    const escaped = escapeRegExpChars(chars)
    const re = new RegExp(`[${escaped}]+$`, 'g')
    return new TextHandler(raw.replace(re, ''))
  }

  upper(): TextHandler {
    return new TextHandler(this.toString().toUpperCase())
  }

  lower(): TextHandler {
    return new TextHandler(this.toString().toLowerCase())
  }

  capitalize(): TextHandler {
    const s = this.toString()
    if (!s) return new TextHandler('')
    return new TextHandler(s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
  }

  casefold(): TextHandler {
    return new TextHandler(this.toString().toLowerCase())
  }

  override replace(searchValue: any, replaceValue: any, count = -1): any {
    const s = this.toString()
    if (typeof searchValue === 'string' && typeof replaceValue === 'string') {
      if (count < 0) {
        return new TextHandler(s.split(searchValue).join(replaceValue))
      }
      if (count === 0 || !searchValue) {
        return new TextHandler(s)
      }
      let result = ''
      let remaining = s
      let replaced = 0
      while (replaced < count) {
        const idx = remaining.indexOf(searchValue)
        if (idx === -1) break
        result += remaining.slice(0, idx) + replaceValue
        remaining = remaining.slice(idx + searchValue.length)
        replaced++
      }
      return new TextHandler(result + remaining)
    }
    return new TextHandler(s.replace(searchValue, replaceValue))
  }

  override split(separator?: any, limit?: number): any {
    const raw = this.toString()
    if (separator === undefined) {
      const trimmed = raw.trim()
      if (!trimmed) return new TextHandlers()
      const parts = trimmed.split(/\s+/)
      return new TextHandlers(limit !== undefined && limit >= 0 ? parts.slice(0, limit) : parts)
    }
    const parts = raw.split(separator, limit)
    return new TextHandlers(parts)
  }

  sort(reverse = false): TextHandler {
    const chars = Array.from(this.toString()).sort()
    if (reverse) {
      chars.reverse()
    }
    return new TextHandler(chars.join(''))
  }

  clean(removeEntities?: boolean | { removeEntities?: boolean; remove_entities?: boolean }): TextHandler {
    const shouldRemove =
      typeof removeEntities === 'object' && removeEntities !== null
        ? Boolean(removeEntities.removeEntities ?? removeEntities.remove_entities)
        : Boolean(removeEntities)
    return new TextHandler(cleanText(this.toString(), shouldRemove))
  }

  get(_defaultValue: any = null): TextHandler {
    return this
  }

  getall(): TextHandler {
    return this
  }

  extract(): TextHandler {
    return this
  }

  extractFirst(defaultValue: any = null): TextHandler {
    return this.get(defaultValue)
  }

  extract_first(defaultValue: any = null): TextHandler {
    return this.get(defaultValue)
  }

  json<T = any>(): T {
    return JSON.parse(this.toString()) as T
  }

  re(
    regex: string | RegExp,
    options: RegexExtractOptions & { checkMatch: true },
  ): boolean
  re(
    regex: string | RegExp,
    options: RegexExtractOptions & { check_match: true },
  ): boolean
  re(
    regex: string | RegExp,
    replaceEntities: boolean,
    cleanMatch: boolean,
    caseSensitive: boolean,
    checkMatch: true,
  ): boolean
  re(
    regex: string | RegExp,
    optionsOrReplaceEntities?: RegexExtractOptions | boolean,
    cleanMatch?: boolean,
    caseSensitive?: boolean,
    checkMatch?: false,
  ): TextHandlers
  re(
    regex: string | RegExp,
    optionsOrReplaceEntities?: RegexExtractOptions | boolean,
    cleanMatch = false,
    caseSensitive = true,
    checkMatch = false,
  ): TextHandlers | boolean {
    const opts = normalizeRegexOptions(
      optionsOrReplaceEntities,
      cleanMatch,
      caseSensitive,
      checkMatch,
    )
    const source = typeof regex === 'string' ? regex : regex.source
    let flags = 'gu'
    if (!opts.caseSensitive || (typeof regex !== 'string' && regex.ignoreCase)) {
      flags += 'i'
    }
    if (typeof regex !== 'string') {
      if (regex.multiline && !flags.includes('m')) flags += 'm'
      if (regex.dotAll && !flags.includes('s')) flags += 's'
    }
    const compiled = new RegExp(source, flags)
    const inputText = opts.cleanMatch ? this.clean().toString() : this.toString()

    if (opts.checkMatch) {
      return compiled.test(inputText)
    }

    const rawMatches = Array.from(inputText.matchAll(compiled))
    if (rawMatches.length === 0) {
      return new TextHandlers()
    }

    const extracted: string[] = []
    for (const match of rawMatches) {
      if (match.length > 1) {
        for (let i = 1; i < match.length; i++) {
          extracted.push(match[i] ?? '')
        }
      } else {
        extracted.push(match[0] ?? '')
      }
    }

    if (!opts.replaceEntities) {
      return new TextHandlers(extracted.map((s) => new TextHandler(s)))
    }
    return new TextHandlers(extracted.map((s) => new TextHandler(replaceEntities(s))))
  }

  reFirst(
    regex: string | RegExp,
    defaultValue: any = null,
    optionsOrReplaceEntities?: RegexExtractOptions | boolean,
    cleanMatch = false,
    caseSensitive = true,
  ): TextHandler | any {
    if (
      typeof defaultValue === 'object' &&
      defaultValue !== null &&
      optionsOrReplaceEntities === undefined &&
      ('default' in defaultValue ||
        'replaceEntities' in defaultValue ||
        'replace_entities' in defaultValue ||
        'cleanMatch' in defaultValue ||
        'clean_match' in defaultValue ||
        'caseSensitive' in defaultValue ||
        'case_sensitive' in defaultValue)
    ) {
      const fallback = 'default' in defaultValue ? defaultValue.default : null
      const matches = this.re(regex, defaultValue) as TextHandlers
      return matches.length > 0 ? matches[0] : fallback
    }
    const matches = this.re(
      regex,
      optionsOrReplaceEntities,
      cleanMatch,
      caseSensitive,
      false,
    )
    return matches.length > 0 ? matches[0] : defaultValue
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
}

export class TextHandlers extends Array<TextHandler> {
  constructor(items?: Iterable<TextHandler | string> | number) {
    if (typeof items === 'number') {
      super(items)
    } else if (items) {
      const normalized = Array.from(items, (item) =>
        item instanceof TextHandler ? item : new TextHandler(item),
      )
      super(...normalized)
    } else {
      super()
    }
    Object.setPrototypeOf(this, TextHandlers.prototype)
  }

  override slice(start?: number, end?: number): TextHandlers {
    return new TextHandlers(super.slice(start, end))
  }

  re(
    regex: string | RegExp,
    optionsOrReplaceEntities?: RegexExtractOptions | boolean,
    cleanMatch = false,
    caseSensitive = true,
  ): TextHandlers {
    const nested = this.map(
      (item) =>
        new TextHandler(item).re(
          regex,
          optionsOrReplaceEntities,
          cleanMatch,
          caseSensitive,
          false,
        ),
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
    if (
      typeof defaultValue === 'object' &&
      defaultValue !== null &&
      optionsOrReplaceEntities === undefined &&
      ('default' in defaultValue ||
        'replaceEntities' in defaultValue ||
        'replace_entities' in defaultValue ||
        'cleanMatch' in defaultValue ||
        'clean_match' in defaultValue ||
        'caseSensitive' in defaultValue ||
        'case_sensitive' in defaultValue)
    ) {
      const fallback = 'default' in defaultValue ? defaultValue.default : null
      for (const item of this) {
        const res = new TextHandler(item).re(regex, defaultValue) as TextHandlers
        if (res.length > 0) {
          return res[0]
        }
      }
      return fallback
    }
    for (const item of this) {
      const res = new TextHandler(item).re(
        regex,
        optionsOrReplaceEntities,
        cleanMatch,
        caseSensitive,
        false,
      )
      if (res.length > 0) {
        return res[0]
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

  get(defaultValue: any = null): TextHandler | any {
    return this.length > 0 ? this[0] : defaultValue
  }

  extract(): this {
    return this
  }

  extractFirst(defaultValue: any = null): TextHandler | any {
    return this.get(defaultValue)
  }

  extract_first(defaultValue: any = null): TextHandler | any {
    return this.get(defaultValue)
  }

  getall(): this {
    return this
  }

  toStrings(): string[] {
    return Array.from(this, (item) => item.toString())
  }
}

export class AttributesHandler {
  private readonly _data: ReadonlyMap<string, TextHandler>
  readonly [key: string]: any

  constructor(mapping?: Record<string, any> | Map<string, any> | NamedNodeMap | null) {
    const entries = new Map<string, TextHandler>()
    if (mapping) {
      if (typeof NamedNodeMap !== 'undefined' && mapping instanceof NamedNodeMap) {
        for (let i = 0; i < mapping.length; i++) {
          const attr = mapping.item(i)
          if (attr) {
            entries.set(attr.name, new TextHandler(attr.value))
          }
        }
      } else if (mapping instanceof Map) {
        for (const [k, v] of mapping.entries()) {
          entries.set(String(k), v instanceof TextHandler ? v : new TextHandler(String(v)))
        }
      } else if (typeof mapping === 'object') {
        for (const [k, v] of Object.entries(mapping)) {
          if (v !== undefined) {
            entries.set(k, v instanceof TextHandler ? v : new TextHandler(String(v)))
          }
        }
      }
    }
    this._data = entries

    return new Proxy(this, {
      get(target, prop, receiver) {
        if (Reflect.has(target, prop) || typeof prop === 'symbol') {
          const val: any = Reflect.get(target, prop, receiver)
          return typeof val === 'function' ? val.bind(target) : val
        }
        if (typeof prop === 'string' && target._data.has(prop)) {
          return target._data.get(prop)
        }
        return undefined
      },
      has(target, prop) {
        if (typeof prop === 'string' && target._data.has(prop)) {
          return true
        }
        return Reflect.has(target, prop)
      },
      ownKeys(target) {
        return Array.from(target._data.keys())
      },
      getOwnPropertyDescriptor(target, prop) {
        if (typeof prop === 'string' && target._data.has(prop)) {
          return {
            enumerable: true,
            configurable: true,
            writable: false,
            value: target._data.get(prop),
          }
        }
        return Reflect.getOwnPropertyDescriptor(target, prop)
      },
      set() {
        throw new TypeError('AttributesHandler is read-only')
      },
    })
  }

  get(key: string, defaultValue: any = null): TextHandler | any {
    if (this._data.has(key)) {
      return this._data.get(key)!
    }
    return defaultValue
  }

  has(key: string): boolean {
    return this._data.has(key)
  }

  keys(): IterableIterator<string> {
    return this._data.keys()
  }

  values(): IterableIterator<TextHandler> {
    return this._data.values()
  }

  entries(): IterableIterator<[string, TextHandler]> {
    return this._data.entries()
  }

  items(): IterableIterator<[string, TextHandler]> {
    return this._data.entries()
  }

  get length(): number {
    return this._data.size
  }

  get size(): number {
    return this._data.size
  }

  *searchValues(
    keyword: string,
    partialOrOptions: boolean | { partial?: boolean } = false,
  ): Generator<AttributesHandler, void, unknown> {
    const partial =
      typeof partialOrOptions === 'object' && partialOrOptions !== null
        ? Boolean(partialOrOptions.partial)
        : Boolean(partialOrOptions)
    for (const [key, value] of this._data.entries()) {
      const strVal = value.toString()
      if (partial ? strVal.includes(keyword) : strVal === keyword) {
        yield new AttributesHandler({ [key]: value })
      }
    }
  }

  *search_values(
    keyword: string,
    partialOrOptions: boolean | { partial?: boolean } = false,
  ): Generator<AttributesHandler, void, unknown> {
    yield* this.searchValues(keyword, partialOrOptions)
  }

  get jsonString(): string {
    return JSON.stringify(this.toDict())
  }

  get json_string(): Uint8Array {
    return new TextEncoder().encode(this.jsonString)
  }

  toDict(): Record<string, string> {
    const out: Record<string, string> = {}
    for (const [k, v] of this._data.entries()) {
      out[k] = v.toString()
    }
    return out
  }

  equals(other: AttributesHandler | Record<string, string>): boolean {
    const otherDict = other instanceof AttributesHandler ? other.toDict() : other
    const selfDict = this.toDict()
    const selfKeys = Object.keys(selfDict)
    const otherKeys = Object.keys(otherDict)
    if (selfKeys.length !== otherKeys.length) return false
    return selfKeys.every((k) => selfDict[k] === String(otherDict[k]))
  }

  [Symbol.iterator](): IterableIterator<[string, TextHandler]> {
    return this._data.entries()
  }

  toString(): string {
    return JSON.stringify(this.toDict())
  }
}
