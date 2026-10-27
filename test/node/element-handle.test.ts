import { afterEach, describe, expect, it } from 'vitest'
import {
  ElementHandleError,
  Selector,
  setDomAdapter,
  type SelectorOptions,
} from '../../src'
import { createLinkedomAdapter } from './support/linkedom-adapter'

const CARD_HTML =
  '<div id="card" class="card"><h2>Title</h2><button class="cta" type="button">Buy</button></div>'

interface FakeElementHandle {
  evaluate<R>(pageFunction: (element: Element) => R): Promise<R>
  asElement(): FakeElementHandle | null
}

function fakeElementHandle(html: string): FakeElementHandle {
  const element = { outerHTML: html } as unknown as Element
  const handle: FakeElementHandle = {
    evaluate: <R>(pageFunction: (element: Element) => R): Promise<R> =>
      Promise.resolve(pageFunction(element)),
    asElement: () => handle,
  }
  return handle
}

afterEach(() => {
  setDomAdapter(null)
})

describe('Selector.fromHandle', () => {
  it('snapshots a Puppeteer-like ElementHandle into an offline Selector', async () => {
    const dom = createLinkedomAdapter()
    const page = await Selector.fromHandle(fakeElementHandle(CARD_HTML), {
      dom,
      adaptive: false,
    })

    expect(page.tag).toBe('div')
    expect(page.css('button.cta').length).toBe(1)
    expect(page.css('button.cta')[0].text.toString()).toBe('Buy')
    expect(page.attr('id')?.toString()).toBe('card')
  })

  it('works with the adapter registered globally', async () => {
    setDomAdapter(createLinkedomAdapter())
    const page = await Selector.fromHandle(fakeElementHandle(CARD_HTML))
    expect(page.xpath('//h2').length).toBe(1)
  })

  it('rejects handles that are not elements and explains the required shape', async () => {
    await expect(Selector.fromHandle({})).rejects.toThrowError(ElementHandleError)
    await expect(Selector.fromHandle({})).rejects.toThrowError(/ElementHandle/)

    await expect(
      Selector.fromHandle({ evaluate: () => Promise.resolve(1) }),
    ).rejects.toThrowError(/asElement/)

    await expect(
      Selector.fromHandle({ evaluate: () => Promise.resolve(1), asElement: () => null }),
    ).rejects.toThrowError(/does not reference an element/)

    const empty: FakeElementHandle = {
      evaluate: () => Promise.resolve(''),
      asElement: () => empty,
    }
    await expect(Selector.fromHandle(empty)).rejects.toThrowError(/outerHTML/)
  })

  it('explains why new Selector(handle) cannot work synchronously', () => {
    const handle = fakeElementHandle(CARD_HTML) as unknown as SelectorOptions
    expect(() => new Selector(handle)).toThrowError(ElementHandleError)
    expect(() => new Selector(handle)).toThrowError(/Selector\.fromHandle/)
  })
})
