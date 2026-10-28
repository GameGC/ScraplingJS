import { describe, expect, it } from 'vitest'
import {
  interpolateCssSelector,
  interpolateXPathSelector,
  resolveXPathQuerySettings,
  scopeXPathToContext,
} from '../../src/parser/query-runner'

describe('selector variable interpolation', () => {
  it('never re-scans inserted values for other variables (XPath)', () => {
    const resolved = interpolateXPathSelector(
      '//span[@data-a=$a and @data-b=$b]',
      { a: 'x $b y', b: ' or 1=1 or ' },
    )
    expect(resolved).toBe(
      "//span[@data-a='x $b y' and @data-b=' or 1=1 or ']",
    )
  })

  it('never re-scans inserted values for other variables (CSS)', () => {
    const resolved = interpolateCssSelector(
      'div[data-a=$a][data-b=$b]',
      { a: 'test $b test', b: 'foo' },
    )
    expect(resolved).toBe('div[data-a="test $b test"][data-b="foo"]')
  })

  it('keeps quoted CSS tokens as a single escaped string', () => {
    expect(interpolateCssSelector('a[href="$href"]', { href: '/a"b' })).toBe(
      'a[href="/a\\"b"]',
    )
    expect(interpolateCssSelector('a[href="$href"]', { href: '/x' })).toBe(
      'a[href="/x"]',
    )
  })

  it('leaves unknown variables and overlapping names intact', () => {
    expect(interpolateCssSelector('div[data=$a][data-x=$ab]', { a: '1', ab: '2' })).toBe(
      'div[data="1"][data-x="2"]',
    )
    expect(interpolateXPathSelector('//i[@a=$unknown]', { a: '1' })).toBe(
      '//i[@a=$unknown]',
    )
  })

  it('coerces XPath numbers and booleans without quoting them', () => {
    expect(interpolateXPathSelector('//i[@n=$n and @b=$b]', { n: 42, b: false })).toBe(
      '//i[@n=42 and @b=false]',
    )
  })

  it('merges the positional variables argument with object options', () => {
    const settings = resolveXPathQuerySettings(
      { identifier: 'row', variables: { b: 2 } },
      undefined,
      undefined,
      40,
      { a: 1 },
      { adaptive: true, autoSave: true },
    )
    expect(settings.variables).toEqual({ a: 1, b: 2 })
  })
})

describe('scopeXPathToContext', () => {
  it('scopes every union branch that starts with //', () => {
    expect(scopeXPathToContext('//div | //span')).toBe('.//div | .//span')
    expect(scopeXPathToContext(' //a[@x="|"] | //b')).toBe(' .//a[@x="|"] | .//b')
  })

  it('keeps absolute and already-relative expressions untouched', () => {
    expect(scopeXPathToContext('/html/body/p')).toBe('/html/body/p')
    expect(scopeXPathToContext('.//p')).toBe('.//p')
    expect(scopeXPathToContext('(//li)[1]')).toBe('(//li)[1]')
  })
})
