import { describe, expect, it } from 'vitest'
import { resolveDynamicParams, SEED_PATTERN } from '../lib/request-params'

describe('resolveDynamicParams', () => {
  it('accepts safe seeds and known framework ids', () => {
    expect(resolveDynamicParams({ seed: 'a7f1e' })).toEqual({ ok: true, seed: 'a7f1e' })
    expect(resolveDynamicParams({ seed: 'vue_scope-42' })).toEqual({
      ok: true,
      seed: 'vue_scope-42',
    })
    expect(resolveDynamicParams({ seed: 'seed', framework: 'vue-tailwind' })).toEqual({
      ok: true,
      seed: 'seed',
      framework: 'vue-tailwind',
    })
  })

  it('generates a valid seed when none is provided', () => {
    const result = resolveDynamicParams({})
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(SEED_PATTERN.test(result.seed)).toBe(true)
    }
  })

  it('rejects seeds that could escape an attribute or style context', () => {
    expect(resolveDynamicParams({ seed: '"><script>alert(1)</script>' })).toEqual({
      ok: false,
      error: 'Invalid seed parameter',
    })
    expect(resolveDynamicParams({ seed: "x' onmouseover='alert(1)" })).toEqual({
      ok: false,
      error: 'Invalid seed parameter',
    })
    expect(resolveDynamicParams({ seed: 'a'.repeat(33) })).toEqual({
      ok: false,
      error: 'Invalid seed parameter',
    })
    expect(resolveDynamicParams({ seed: 'a b' })).toEqual({
      ok: false,
      error: 'Invalid seed parameter',
    })
  })

  it('rejects framework values outside the allowlist', () => {
    expect(resolveDynamicParams({ seed: 'ok', framework: 'react" onload="x' })).toEqual({
      ok: false,
      error: 'Unknown framework parameter',
    })
    expect(resolveDynamicParams({ seed: 'ok', framework: 'express-bem' })).toEqual({
      ok: false,
      error: 'Unknown framework parameter',
    })
  })
})
