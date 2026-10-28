import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryStorageSystem } from '../../src/storage/memory'
import { isValidFingerprint } from '../../src/storage/base'
import { extractBaseDomain } from '../../src/core/text-utils'
import type { ElementFingerprint } from '../../src/types'

function fingerprint(label: string): ElementFingerprint {
  return {
    tag: 'div',
    attributes: { 'data-label': label },
    text: label,
    path: ['div'],
  }
}

describe('extractBaseDomain isolation keys', () => {
  it('keeps loopback, private IPs, localhost and extension ids distinct', () => {
    expect(extractBaseDomain('https://127.0.0.1:8080/jobs')).toBe('127.0.0.1:8080')
    expect(extractBaseDomain('http://10.0.0.1/')).toBe('10.0.0.1')
    expect(extractBaseDomain('http://192.168.0.1:9000/')).toBe('192.168.0.1:9000')
    expect(extractBaseDomain('http://[::1]:3000/')).toBe('[::1]:3000')
    expect(extractBaseDomain('http://localhost:3000/')).toBe('localhost:3000')
    expect(extractBaseDomain('chrome-extension://abcdefghijklmnop/popup.html')).toBe(
      'abcdefghijklmnop',
    )
    expect(extractBaseDomain('intranet')).toBe('intranet')
  })

  it('still reduces public hostnames to the registrable domain', () => {
    expect(extractBaseDomain('https://jobs.example.com/list')).toBe('example.com')
    expect(extractBaseDomain('https://www.example.co.uk/')).toBe('example.co.uk')
    expect(extractBaseDomain('')).toBe('default')
    expect(extractBaseDomain(null)).toBe('default')
  })
})

describe('isValidFingerprint guards', () => {
  it('rejects non-finite indices and non-string sibling lists', () => {
    expect(
      isValidFingerprint({ ...fingerprint('x'), sibling_index: Infinity }),
    ).toBe(false)
    expect(isValidFingerprint({ ...fingerprint('x'), depth: Number.NaN })).toBe(false)
    expect(isValidFingerprint({ ...fingerprint('x'), siblings: [1] })).toBe(false)
    expect(isValidFingerprint({ ...fingerprint('x'), children: [null] })).toBe(false)
    expect(
      isValidFingerprint({
        ...fingerprint('x'),
        rect: { x: Infinity, y: 0, width: 10, height: 10 },
      }),
    ).toBe(false)
    expect(isValidFingerprint({ ...fingerprint('x'), sibling_index: 2 })).toBe(true)
  })
})

describe('MemoryStorageSystem isolation', () => {
  beforeEach(() => {
    MemoryStorageSystem.clearAll()
  })

  it('honours a capacity requested for an already registered storage file', () => {
    const wide = new MemoryStorageSystem({
      storageFile: 'capacity-mismatch',
      capacity: 10,
      url: 'https://wide.example.com',
    })
    const narrow = new MemoryStorageSystem({
      storageFile: 'capacity-mismatch',
      capacity: 2,
      url: 'https://narrow.example.com',
    })

    expect(wide.capacity).toBe(10)
    expect(narrow.capacity).toBe(2)

    narrow.save(fingerprint('one'), 'one')
    narrow.save(fingerprint('two'), 'two')
    narrow.save(fingerprint('three'), 'three')

    expect(narrow.retrieve('one')).toBeNull()
    expect(narrow.retrieve('three')).not.toBeNull()

    wide.save(fingerprint('wide'), 'wide')
    expect(wide.retrieve('wide')).not.toBeNull()
  })

  it('clears only the current domain from a shared bucket', () => {
    const first = new MemoryStorageSystem({
      storageFile: 'scoped-clear',
      url: 'https://first.example.com',
    })
    const second = new MemoryStorageSystem({
      storageFile: 'scoped-clear',
      url: 'https://second.example.net',
    })

    first.save(fingerprint('first'), 'shared-key')
    second.save(fingerprint('second'), 'shared-key')

    first.clear()

    expect(first.retrieve('shared-key')).toBeNull()
    expect(second.retrieve('shared-key')?.text).toBe('second')
  })
})
