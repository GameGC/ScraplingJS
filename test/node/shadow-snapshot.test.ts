import { describe, expect, it } from 'vitest'
import { parseHTML } from 'linkedom'
import { captureShadowSnapshot } from '../../src/snapshot/shadow-dom'

describe('captureShadowSnapshot in Node', () => {
  it('serializes a document passed explicitly without touching global DOM globals', () => {
    const { document } = parseHTML('<html><body><p>plain</p></body></html>')
    expect(captureShadowSnapshot(document)).toBeNull()
  })

  it('explains the missing document instead of throwing a ReferenceError', () => {
    expect(() => captureShadowSnapshot()).toThrowError(/needs a Document/)
  })
})
