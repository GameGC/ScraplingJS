import { describe, expect, it } from 'vitest'
import { VERSION } from '../src'

describe('scrapling-js project setup', () => {
  it('exports VERSION', () => {
    expect(VERSION).toBe('0.5.0')
  })
})
