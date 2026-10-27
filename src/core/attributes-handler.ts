import { TextHandler } from './text-handler'

interface AttributeListLike {
  length: number
  item(index: number): Attr | null
}

function isAttributeListLike(value: unknown): value is AttributeListLike {
  if (!value || typeof value !== 'object') return false
  const candidate = value as { length?: unknown; item?: unknown }
  return typeof candidate.length === 'number' && typeof candidate.item === 'function'
}

export class AttributesHandler {
  private readonly _data: ReadonlyMap<string, TextHandler>
  readonly [key: string]: unknown

  constructor(mapping?: Record<string, unknown> | Map<string, unknown> | NamedNodeMap | null) {
    const entries = new Map<string, TextHandler>()
    if (mapping) {
      if (isAttributeListLike(mapping)) {
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
          const val: unknown = Reflect.get(target, prop, receiver)
          return typeof val === 'function' ? (val as Function).bind(target) : val
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

  get<T = null>(key: string, defaultValue: T = null as unknown as T): TextHandler | T {
    const val = this._data.get(key)
    return val !== undefined ? val : defaultValue
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
