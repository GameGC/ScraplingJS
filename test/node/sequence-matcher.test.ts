import { describe, expect, it } from 'vitest'
import { SequenceMatcher, sequenceRatio } from '../../src/core/sequence-matcher'

function arrayLike(values: readonly string[]): ArrayLike<string> {
  return {
    length: values.length,
    ...Object.fromEntries(values.map((value, index) => [index, value])),
  }
}

describe('SequenceMatcher pooled scratch buffers', () => {
  it('clears every written counter when matching throws mid-scan', () => {
    const b = arrayLike(['a', 'b', 'c', 'd', 'e', 'f'])
    const a = arrayLike(['a', 'b', 'c', 'd', 'e', 'f'])
    const throwing: ArrayLike<string> = {
      length: a.length,
      0: 'a',
      1: 'b',
      get 2(): string {
        throw new Error('boom')
      },
      3: 'd',
      4: 'e',
      5: 'f',
    }

    const matcher = new SequenceMatcher<string>(null, throwing, b)
    expect(() => matcher.findLongestMatch(0, 6, 0, 6)).toThrow('boom')

    expect(sequenceRatio('x', 'abx')).toBeCloseTo(0.5, 10)
    expect(sequenceRatio('x', 'abx')).toBeLessThanOrEqual(1)
    expect(sequenceRatio('abc', 'abc')).toBe(1)
  })

  it('falls back to local buffers for a re-entrant call', () => {
    let innerRatio: number | null = null
    const a: ArrayLike<string> = {
      length: 3,
      0: 'a',
      get 1(): string {
        innerRatio = sequenceRatio('x', 'abx')
        return 'b'
      },
      2: 'c',
    }
    const b = arrayLike(['a', 'b', 'c'])

    const matcher = new SequenceMatcher<string>(null, a, b)
    const [i, j, size] = matcher.findLongestMatch(0, 3, 0, 3)

    expect(innerRatio).toBeCloseTo(0.5, 10)
    expect([i, j, size]).toEqual([0, 0, 3])
    expect(sequenceRatio('abc', 'abc')).toBe(1)
  })
})
