import { beforeEach, describe, expect, it } from 'vitest'
import {
  MemoryStorageSystem,
  calculateSimilarityScore,
  isValidFingerprint,
  type ElementFingerprint,
  type StorageErrorHandler,
} from '../src'

describe('Adversarial Stress Test: isValidFingerprint Type Guard', () => {
  it('rejects null, undefined, primitives, symbols, and functions', () => {
    expect(isValidFingerprint(null)).toBe(false)
    expect(isValidFingerprint(undefined)).toBe(false)
    expect(isValidFingerprint(0)).toBe(false)
    expect(isValidFingerprint(42)).toBe(false)
    expect(isValidFingerprint(-1)).toBe(false)
    expect(isValidFingerprint(NaN)).toBe(false)
    expect(isValidFingerprint(Infinity)).toBe(false)
    expect(isValidFingerprint(-Infinity)).toBe(false)
    expect(isValidFingerprint(true)).toBe(false)
    expect(isValidFingerprint(false)).toBe(false)
    expect(isValidFingerprint('')).toBe(false)
    expect(isValidFingerprint('button')).toBe(false)
    expect(isValidFingerprint(Symbol('fingerprint'))).toBe(false)
    expect(isValidFingerprint(() => ({}))).toBe(false)
    expect(isValidFingerprint([])).toBe(false)
    expect(isValidFingerprint([1, 2, 3])).toBe(false)
  })

  it('rejects primitive wrappers and empty objects', () => {
    expect(isValidFingerprint(new String('div'))).toBe(false)
    expect(isValidFingerprint(new Number(123))).toBe(false)
    expect(isValidFingerprint(new Boolean(true))).toBe(false)
    expect(isValidFingerprint({})).toBe(false)
    expect(isValidFingerprint(Object.create(null))).toBe(false)
  })

  it('rejects malformed or non-string tags', () => {
    const base = { attributes: {}, path: ['div'] }
    expect(isValidFingerprint({ ...base, tag: '' })).toBe(false)
    expect(isValidFingerprint({ ...base, tag: '   ' })).toBe(false)
    expect(isValidFingerprint({ ...base, tag: '\t\r\n' })).toBe(false)
    expect(isValidFingerprint({ ...base, tag: null })).toBe(false)
    expect(isValidFingerprint({ ...base, tag: undefined })).toBe(false)
    expect(isValidFingerprint({ ...base, tag: 123 })).toBe(false)
    expect(isValidFingerprint({ ...base, tag: true })).toBe(false)
    expect(isValidFingerprint({ ...base, tag: {} })).toBe(false)
    expect(isValidFingerprint({ ...base, tag: [] })).toBe(false)
    expect(isValidFingerprint({ ...base, tag: Symbol('tag') })).toBe(false)
  })

  it('rejects malformed or non-object attributes and attributes with non-string values', () => {
    const base = { tag: 'div', path: ['div'] }
    expect(isValidFingerprint({ ...base, attributes: null })).toBe(false)
    expect(isValidFingerprint({ ...base, attributes: undefined })).toBe(false)
    expect(isValidFingerprint({ ...base, attributes: 'class="btn"' })).toBe(false)
    expect(isValidFingerprint({ ...base, attributes: 123 })).toBe(false)
    expect(isValidFingerprint({ ...base, attributes: true })).toBe(false)
    expect(isValidFingerprint({ ...base, attributes: ['class', 'btn'] })).toBe(false)
    expect(isValidFingerprint({ ...base, attributes: { id: 123 } })).toBe(false)
    expect(isValidFingerprint({ ...base, attributes: { disabled: true } })).toBe(false)
    expect(isValidFingerprint({ ...base, attributes: { count: null } })).toBe(false)
    expect(isValidFingerprint({ ...base, attributes: { nested: {} } })).toBe(false)
    expect(isValidFingerprint({ ...base, attributes: { arr: [] } })).toBe(false)
    expect(isValidFingerprint({ ...base, attributes: { sym: Symbol('attr') } })).toBe(false)
  })

  it('rejects invalid path formats (empty arrays, non-strings, single tags without separator)', () => {
    const base = { tag: 'div', attributes: {} }
    expect(isValidFingerprint({ ...base, path: '' })).toBe(false)
    expect(isValidFingerprint({ ...base, path: '   ' })).toBe(false)
    expect(isValidFingerprint({ ...base, path: 'div' })).toBe(false)
    expect(isValidFingerprint({ ...base, path: [] })).toBe(false)
    expect(isValidFingerprint({ ...base, path: [''] })).toBe(false)
    expect(isValidFingerprint({ ...base, path: ['   '] })).toBe(false)
    expect(isValidFingerprint({ ...base, path: [123] })).toBe(false)
    expect(isValidFingerprint({ ...base, path: [null] })).toBe(false)
    expect(isValidFingerprint({ ...base, path: ['html', 123] })).toBe(false)
    expect(isValidFingerprint({ ...base, path: ['html', null] })).toBe(false)
    expect(isValidFingerprint({ ...base, path: {} })).toBe(false)
    expect(isValidFingerprint({ ...base, path: null })).toBe(false)
    expect(isValidFingerprint({ ...base, path: undefined })).toBe(false)
  })

  it('accepts valid path formats (arrays of strings and hierarchical string selectors)', () => {
    const base = { tag: 'button', attributes: { class: 'btn' } }
    expect(isValidFingerprint({ ...base, path: ['button'] })).toBe(true)
    expect(isValidFingerprint({ ...base, path: ['html', 'body', 'div', 'button'] })).toBe(true)
    expect(isValidFingerprint({ ...base, path: 'html > body > button' })).toBe(true)
    expect(isValidFingerprint({ ...base, path: '/html/body/button' })).toBe(true)
    expect(isValidFingerprint({ ...base, path: 'div > button' })).toBe(true)
  })

  it('rejects invalid optional fields: non-string text, invalid parent_attribs, non-array siblings', () => {
    const validBase: ElementFingerprint = {
      tag: 'span',
      attributes: { id: 'badge' },
      path: ['span'],
    }
    expect(isValidFingerprint({ ...validBase, text: 123 })).toBe(false)
    expect(isValidFingerprint({ ...validBase, text: {} })).toBe(false)
    expect(isValidFingerprint({ ...validBase, text: [] })).toBe(false)
    expect(isValidFingerprint({ ...validBase, text: null })).toBe(true)
    expect(isValidFingerprint({ ...validBase, text: 'valid text' })).toBe(true)

    expect(isValidFingerprint({ ...validBase, all_text: 456 })).toBe(false)
    expect(isValidFingerprint({ ...validBase, all_text: null })).toBe(true)
    expect(isValidFingerprint({ ...validBase, all_text: 'full text' })).toBe(true)

    expect(isValidFingerprint({ ...validBase, parent_name: 123 })).toBe(false)
    expect(isValidFingerprint({ ...validBase, parent_name: 'div' })).toBe(true)

    expect(isValidFingerprint({ ...validBase, parent_attribs: 'id="main"' })).toBe(false)
    expect(isValidFingerprint({ ...validBase, parent_attribs: null })).toBe(false)
    expect(isValidFingerprint({ ...validBase, parent_attribs: ['a'] })).toBe(false)
    expect(isValidFingerprint({ ...validBase, parent_attribs: { id: 12345 as unknown as string } })).toBe(false)
    expect(isValidFingerprint({ ...validBase, parent_attribs: {} })).toBe(true)
    expect(isValidFingerprint({ ...validBase, parent_attribs: { id: 'main' } })).toBe(true)

    expect(isValidFingerprint({ ...validBase, semantic_attrs: 'role="button"' as unknown as Record<string, string> })).toBe(false)
    expect(isValidFingerprint({ ...validBase, semantic_attrs: null as unknown as Record<string, string> })).toBe(false)
    expect(isValidFingerprint({ ...validBase, semantic_attrs: ['a'] as unknown as Record<string, string> })).toBe(false)
    expect(isValidFingerprint({ ...validBase, semantic_attrs: { role: 12345 as unknown as string } })).toBe(false)
    expect(isValidFingerprint({ ...validBase, semantic_attrs: {} })).toBe(true)
    expect(isValidFingerprint({ ...validBase, semantic_attrs: { role: 'button' } })).toBe(true)

    expect(isValidFingerprint({ ...validBase, stable_classes: 'btn' as unknown as string[] })).toBe(false)
    expect(isValidFingerprint({ ...validBase, stable_classes: [12345 as unknown as string] })).toBe(false)
    expect(isValidFingerprint({ ...validBase, stable_classes: [] })).toBe(true)
    expect(isValidFingerprint({ ...validBase, stable_classes: ['btn', 'btn-primary'] })).toBe(true)

    expect(isValidFingerprint({ ...validBase, parent_text: 123 })).toBe(false)
    expect(isValidFingerprint({ ...validBase, parent_text: null })).toBe(true)
    expect(isValidFingerprint({ ...validBase, parent_text: 'parent text' })).toBe(true)

    expect(isValidFingerprint({ ...validBase, siblings: 'not-array' })).toBe(false)
    expect(isValidFingerprint({ ...validBase, siblings: 123 })).toBe(false)
    expect(isValidFingerprint({ ...validBase, siblings: [] })).toBe(true)

    expect(isValidFingerprint({ ...validBase, children: 'not-array' })).toBe(false)
    expect(isValidFingerprint({ ...validBase, children: {} })).toBe(false)
    expect(isValidFingerprint({ ...validBase, children: [] })).toBe(true)
  })

  it('validates depth and sibling_index for numbers and rejects NaN', () => {
    const validBase: ElementFingerprint = {
      tag: 'p',
      attributes: {},
      path: ['p'],
    }
    expect(isValidFingerprint({ ...validBase, depth: 3 })).toBe(true)
    expect(isValidFingerprint({ ...validBase, depth: 0 })).toBe(true)
    expect(isValidFingerprint({ ...validBase, depth: -1 })).toBe(true)
    expect(isValidFingerprint({ ...validBase, depth: NaN })).toBe(false)
    expect(isValidFingerprint({ ...validBase, depth: '3' })).toBe(false)

    expect(isValidFingerprint({ ...validBase, sibling_index: 0 })).toBe(true)
    expect(isValidFingerprint({ ...validBase, sibling_index: 5 })).toBe(true)
    expect(isValidFingerprint({ ...validBase, sibling_index: NaN })).toBe(false)
    expect(isValidFingerprint({ ...validBase, sibling_index: '0' })).toBe(false)
  })

  it('validates rect structure and rejects invalid rect fields', () => {
    const validBase: ElementFingerprint = {
      tag: 'p',
      attributes: {},
      path: ['p'],
    }
    expect(isValidFingerprint({ ...validBase, rect: null })).toBe(true)
    expect(isValidFingerprint({ ...validBase, rect: undefined })).toBe(true)
    expect(
      isValidFingerprint({
        ...validBase,
        rect: { x: 10, y: 20, width: 100, height: 50 },
      }),
    ).toBe(true)

    expect(isValidFingerprint({ ...validBase, rect: 'not-an-object' })).toBe(false)
    expect(isValidFingerprint({ ...validBase, rect: 12345 })).toBe(false)
    expect(
      isValidFingerprint({
        ...validBase,
        rect: { x: '10', y: 20, width: 100, height: 50 },
      }),
    ).toBe(false)
    expect(
      isValidFingerprint({
        ...validBase,
        rect: { x: 10, y: 20, width: '100', height: 50 },
      }),
    ).toBe(false)
    expect(
      isValidFingerprint({
        ...validBase,
        rect: { x: 10, y: 20 },
      }),
    ).toBe(false)
    expect(
      isValidFingerprint({
        ...validBase,
        rect: { x: NaN, y: 20, width: 100, height: 50 },
      }),
    ).toBe(false)
    expect(
      isValidFingerprint({
        ...validBase,
        rect: { x: 10, y: NaN, width: 100, height: 50 },
      }),
    ).toBe(false)
    expect(
      isValidFingerprint({
        ...validBase,
        rect: { x: 10, y: 20, width: NaN, height: 50 },
      }),
    ).toBe(false)
    expect(
      isValidFingerprint({
        ...validBase,
        rect: { x: 10, y: 20, width: 100, height: NaN },
      }),
    ).toBe(false)
    expect(
      isValidFingerprint({
        ...validBase,
        rect: [10, 20, 100, 50] as unknown as { x: number; y: number; width: number; height: number },
      }),
    ).toBe(false)
  })

  it('handles circular references in siblings or extra properties without infinite recursion', () => {
    const circular: Record<string, unknown> = {
      tag: 'div',
      attributes: { class: 'box' },
      path: ['div'],
    }
    circular.self = circular
    circular.siblings = [circular]
    circular.children = [circular]

    // Element-type lists must contain strings; rejecting the malformed entries
    // must not recurse into the circular object graph.
    expect(() => isValidFingerprint(circular)).not.toThrow()
    expect(isValidFingerprint(circular)).toBe(false)
  })

  it('handles huge string payloads safely', () => {
    const hugeStr = 'a'.repeat(200000)
    const fp: ElementFingerprint = {
      tag: 'div',
      attributes: { 'data-huge': hugeStr },
      path: ['html', 'body', 'div'],
      text: hugeStr,
    }
    expect(isValidFingerprint(fp)).toBe(true)
  })

  it('probes prototype poisoning resistance', () => {
    const poisoned = Object.create({
      tag: 'div',
      attributes: { class: 'inherited' },
      path: ['div'],
    })
    expect(isValidFingerprint(poisoned)).toBe(true)

    const nullProto = Object.create(null)
    nullProto.tag = 'div'
    nullProto.attributes = { id: 'clean' }
    nullProto.path = ['div']
    expect(isValidFingerprint(nullProto)).toBe(true)

    const attributesNullProto = Object.create(null)
    attributesNullProto.id = 'clean-attr'
    const fpWithNullProtoAttrs = {
      tag: 'div',
      attributes: attributesNullProto,
      path: ['div'],
    }
    expect(isValidFingerprint(fpWithNullProtoAttrs)).toBe(true)
  })

  it('probes parent_attribs and semantic_attrs non-string values and documents similarity behavior', () => {
    const fpWithNonStringParentAttrs = {
      tag: 'span',
      attributes: { class: 'text' },
      path: ['div', 'span'],
      parent_name: 'div',
      parent_attribs: { id: 12345 as unknown as string, role: 999 as unknown as string },
    }
    expect(isValidFingerprint(fpWithNonStringParentAttrs)).toBe(false)

    let parentAttrError: Error | null = null
    try {
      calculateSimilarityScore(
        fpWithNonStringParentAttrs,
        fpWithNonStringParentAttrs,
      )
    } catch (err: unknown) {
      parentAttrError = err instanceof Error ? err : new Error(String(err))
    }
    expect(parentAttrError).not.toBeNull()
    expect(parentAttrError?.message).toContain('replace is not a function')

    const fpWithNumericSemanticAttr = {
      tag: 'span',
      attributes: { role: 'button' },
      path: ['span'],
      semantic_attrs: { role: 12345 as unknown as string },
    }
    expect(isValidFingerprint(fpWithNumericSemanticAttr)).toBe(false)

    const nanScore = calculateSimilarityScore(
      fpWithNumericSemanticAttr,
      fpWithNumericSemanticAttr,
    )
    expect(Number.isNaN(nanScore)).toBe(true)
  })
})

describe('Adversarial Stress Test: MemoryStorageSystem & Predicates', () => {
  beforeEach(() => {
    MemoryStorageSystem.clearAll()
  })

  it('isolates cache from external mutations after save and retrieve', () => {
    const storage = new MemoryStorageSystem({ url: 'https://mutation.example.com' })
    const sourceFp: ElementFingerprint = {
      tag: 'div',
      attributes: { id: 'original-id' },
      path: ['div'],
      text: 'Original',
    }

    storage.save(sourceFp, 'item-key')

    sourceFp.text = 'Mutated Outside Before Read'
    sourceFp.attributes.id = 'mutated-id'

    const retrieved1 = storage.retrieve('item-key')
    expect(retrieved1).not.toBeNull()
    expect(retrieved1?.text).toBe('Original')
    expect(retrieved1?.attributes.id).toBe('original-id')

    if (retrieved1) {
      retrieved1.text = 'Mutated After Retrieve'
      retrieved1.attributes.id = 'hacked'
    }

    const retrieved2 = storage.retrieve('item-key')
    expect(retrieved2).not.toBeNull()
    expect(retrieved2?.text).toBe('Original')
    expect(retrieved2?.attributes.id).toBe('original-id')
  })

  it('handles custom save predicate throwing non-Error objects', () => {
    const captured: Array<{ error: unknown; op: string; key?: string }> = []
    const storage = new MemoryStorageSystem({
      url: 'https://nonerror.example.com',
      save: () => {
        throw 'raw string error rejection'
      },
      onError: (err, ctx) => {
        captured.push({ error: err, op: ctx.operation, key: ctx.key })
      },
    })

    const fp: ElementFingerprint = {
      tag: 'a',
      attributes: { href: '/' },
      path: ['a'],
    }

    expect(() => {
      storage.save(fp, 'string-err-item')
    }).not.toThrow()

    expect(captured.length).toBe(1)
    expect(captured[0].op).toBe('save')
    expect(captured[0].key).toBe('https://nonerror.example.com:::string-err-item')
    expect(captured[0].error).toBeInstanceOf(Error)
    expect((captured[0].error as Error).message).toBe('raw string error rejection')
  })

  it('re-throws synchronous save errors when onError is omitted', () => {
    const failingSaveStorage = new MemoryStorageSystem({
      storageFile: 'failing-save-bucket',
      url: 'https://no-handler.example.com',
      save: () => {
        throw new Error('Disk write failed without handler')
      },
    })

    const fp: ElementFingerprint = {
      tag: 'h2',
      attributes: {},
      path: ['h2'],
    }

    expect(() => {
      failingSaveStorage.save(fp, 'key1')
    }).toThrow('Disk write failed without handler')
  })

  it('handles async save predicates that return rejected promises without unhandled rejection', async () => {
    const captured: Array<{ error: unknown; op: string; key?: string }> = []
    const storage = new MemoryStorageSystem({
      url: 'https://async-reject.example.com',
      save: async () => {
        await new Promise((resolve) => setTimeout(resolve, 5))
        throw new Error('Async network timeout')
      },
      onError: (err, ctx) => {
        captured.push({ error: err, op: ctx.operation, key: ctx.key })
      },
    })

    const fp: ElementFingerprint = {
      tag: 'button',
      attributes: {},
      path: ['button'],
    }

    storage.save(fp, 'async-fail-key')
    await storage.flush()

    expect(captured.length).toBe(1)
    expect(captured[0].op).toBe('save')
    expect(captured[0].key).toBe('https://async-reject.example.com:::async-fail-key')
    expect((captured[0].error as Error).message).toBe('Async network timeout')
  })
})

describe('Adversarial Stress Test: onError Context Payload & Safety', () => {
  beforeEach(() => {
    MemoryStorageSystem.clearAll()
  })

  it('verifies exact context parameters across save and load operations', async () => {
    const contexts: Array<{ op: string; key?: string }> = []
    const errorHandler: StorageErrorHandler = (_err, ctx) => {
      contexts.push({ op: ctx.operation, key: ctx.key })
    }

    const storage = new MemoryStorageSystem({
      url: 'https://context.example.com',
      save: (_url, key) => {
        if (key.includes('bad')) throw new Error('save fail')
      },
      onError: errorHandler,
    })

    const fp: ElementFingerprint = {
      tag: 'div',
      attributes: {},
      path: ['div'],
    }

    storage.save(fp, 'bad-save')
    expect(contexts[0]).toEqual({
      op: 'save',
      key: 'https://context.example.com:::bad-save',
    })

    await storage.load({
      'https://context.example.com:::malformed-fp': {
        tag: '',
        attributes: {},
        path: [],
      } as unknown as ElementFingerprint,
    })
    expect(contexts[1]).toEqual({
      op: 'load',
      key: 'https://context.example.com:::malformed-fp',
    })
  })

  it('safely handles special characters in identifiers and URLs', () => {
    const keysEncountered: string[] = []
    const storage = new MemoryStorageSystem({
      url: 'https://sub.domain.example.co.uk:8080/path/test?q=1#hash',
      save: (_url, key) => {
        keysEncountered.push(key)
      },
    })

    const fp: ElementFingerprint = {
      tag: 'div',
      attributes: {},
      path: ['div'],
    }

    const specialIdent = 'btn:::special/weird&chars#quote"\'<tag>'
    storage.save(fp, specialIdent)
    expect(keysEncountered[0]).toBe(specialIdent)

    const alreadyPrefixed =
      'https://sub.domain.example.co.uk:8080/path/test?q=1#hash:::prefixed-key'
    storage.save(fp, alreadyPrefixed)
    expect(keysEncountered[1]).toBe('prefixed-key')
  })
})
