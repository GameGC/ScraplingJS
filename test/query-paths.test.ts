import { describe, expect, it } from 'vitest'
import { Selector } from '../src'

const LIGHT_HTML = `<!DOCTYPE html><html><body>
  <div id="root" class="target">
    <ul class="items">
      <li class="item" data-sku="1">Alpha</li>
      <li class="item" data-sku="2">Beta</li>
      <li class="item" data-sku="3">Gamma</li>
    </ul>
    <button class="cta" type="button">Apply</button>
    <section><p class="note">Note</p></section>
  </div>
</body></html>`

const SELECTORS = [
  'li',
  '.item',
  'li.item',
  'ul.items > li',
  'li:nth-child(2)',
  'li:first-child',
  'li:last-child',
  'li + li',
  '#root',
  'div#root',
  '[data-sku="3"]',
  'button.cta',
  '.note',
  'section p',
  '#root .item',
  'ul li.item[data-sku="2"]',
  'li:contains("Beta")',
]

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

function withShadowFiller(doc: Document): Document {
  const host = doc.querySelector('#root') as HTMLElement
  host.attachShadow({ mode: 'open' }).innerHTML =
    '<div class="shadow-only">Shadow filler</div>'
  return doc
}

function matchesOf(page: Selector, selector: string): string[] {
  return Array.from(page.css(selector)).map(
    (item) => `${item.tag}:${item.text.toString()}`,
  )
}

describe('CSS fast path and XPath fallback', () => {
  it('return identical matches whether or not the scope contains shadow content', () => {
    const fastPath = new Selector({
      root: parse(LIGHT_HTML).documentElement,
      adaptive: false,
    })
    const xpathPath = new Selector({
      root: withShadowFiller(parse(LIGHT_HTML)).documentElement,
      adaptive: false,
    })

    for (const selector of SELECTORS) {
      expect(matchesOf(fastPath, selector), selector).toEqual(
        matchesOf(xpathPath, selector),
      )
    }
  })

  it('keeps translator-only selectors working when the fast path cannot run', () => {
    const page = new Selector({
      root: parse(LIGHT_HTML).documentElement,
      adaptive: false,
    })

    expect(matchesOf(page, 'li:contains("Beta")')).toEqual(['li:Beta'])
    expect(page.css('li::text').map((item) => item.text.toString())).toEqual([
      'Alpha',
      'Beta',
      'Gamma',
    ])
    expect(page.css('li::attr(data-sku)').length).toBe(3)
    expect(
      page.css('li[data-sku=$sku]', { sku: '2' }).map((item) => item.text.toString()),
    ).toEqual(['Beta'])
    expect(() => page.css('li::bogus')).toThrowError(/Invalid CSS selector/)
  })

  it('scopes element-rooted // expressions and every union branch to the subtree', () => {
    const page = new Selector({
      root: parse(LIGHT_HTML).documentElement,
      adaptive: false,
    })
    const section = page.css('section')[0]

    expect(section.xpath('//p').map((item) => item.text.toString())).toEqual(['Note'])
    expect(section.xpath('//div | //p').map((item) => item.tag)).toEqual(['p'])
    expect(section.xpath('.//p').length).toBe(1)

    expect(page.xpath('//p').length).toBe(1)
    expect(page.xpath('/html/body/div').length).toBe(1)
  })

  it('does not let one XPath variable expand another inside its literal', () => {
    const page = new Selector({
      root: parse(
        '<html><body><span data-a="x $b y" data-b=" or 1=1 or ">one</span><span data-a="x" data-b=" or 1=1 or ">two</span><span data-b=" or 1=1 or ">three</span></body></html>',
      ).documentElement,
      adaptive: false,
    })

    const result = page.xpath('//span[@data-a=$a and @data-b=$b]', {
      a: 'x $b y',
      b: ' or 1=1 or ',
    })
    expect(result.map((item) => item.text.toString())).toEqual(['one'])
  })

  it('does not escape an element scope through ancestor selectors on the fast path', () => {
    const html = `<!DOCTYPE html><html><body>
      <div class="outer"><section id="sec"><span>Target</span></section></div>
    </body></html>`
    const directDoc = parse(html)
    const slowDoc = parse(html)
    const host = slowDoc.createElement('div')
    ;(slowDoc.querySelector('#sec') as Element).append(host)
    host.attachShadow({ mode: 'open' }).innerHTML = '<i>filler</i>'

    const fast = new Selector({
      root: directDoc.querySelector('#sec') as Element,
      adaptive: false,
    })
    const slow = new Selector({
      root: slowDoc.querySelector('#sec') as Element,
      adaptive: false,
    })

    expect(fast.css('.outer span').length).toBe(0)
    expect(slow.css('.outer span').length).toBe(0)
  })

  it('lets the scope root satisfy the leftmost part of a descendant selector', () => {
    const html = `<!DOCTYPE html><html><body>
      <div class="outer"><span>Target</span></div>
    </body></html>`
    const directDoc = parse(html)
    const slowDoc = parse(html)
    const host = slowDoc.createElement('div')
    ;(slowDoc.body as Element).append(host)
    host.attachShadow({ mode: 'open' }).innerHTML = '<i>filler</i>'

    const fast = new Selector({
      root: directDoc.querySelector('.outer') as Element,
      adaptive: false,
    })
    const slow = new Selector({
      root: slowDoc.querySelector('.outer') as Element,
      adaptive: false,
    })

    expect(fast.css('.outer span').map((item) => item.text.toString())).toEqual(['Target'])
    expect(slow.css('.outer span').map((item) => item.text.toString())).toEqual(['Target'])
  })

  it('applies wildcard type-positional pseudos identically on both paths', () => {
    const html = `<!DOCTYPE html><html><body>
      <div><p>1</p><span class="item">2</span><span class="item">3</span></div>
      <div><span>other</span><span class="item">4</span></div>
      <div><span class="item">5</span></div>
    </body></html>`
    const directDoc = parse(html)
    const slowDoc = parse(html)
    const host = slowDoc.createElement('div')
    ;(slowDoc.body as Element).append(host)
    host.attachShadow({ mode: 'open' }).innerHTML = '<i>filler</i>'

    const fast = new Selector({ root: directDoc.documentElement, adaptive: false })
    const slow = new Selector({ root: slowDoc.documentElement, adaptive: false })

    for (const selector of [
      '.item:first-of-type',
      '.item:last-of-type',
      '.item:nth-of-type(2)',
      '.item:nth-last-of-type(1)',
      '.item:only-of-type',
    ]) {
      expect(matchesOf(fast, selector), selector).toEqual(matchesOf(slow, selector))
    }
    expect(matchesOf(fast, '.item:first-of-type')).toEqual(['span:2', 'span:5'])
    expect(matchesOf(fast, '.item:nth-of-type(2)')).toEqual(['span:3', 'span:4'])
    expect(matchesOf(fast, '.item:only-of-type')).toEqual(['span:5'])
    expect(matchesOf(fast, '.item:last-of-type')).toEqual(['span:3', 'span:4', 'span:5'])
  })

  it('includes the scope root itself only when it matches', () => {
    const fastPath = new Selector({
      root: parse(LIGHT_HTML).querySelector('#root') as Element,
      adaptive: false,
    })
    const xpathPath = new Selector({
      root: withShadowFiller(parse(LIGHT_HTML)).querySelector('#root') as Element,
      adaptive: false,
    })

    expect(
      Array.from(fastPath.css('div#root')).map(
        (item) => item.rawNode === fastPath.rawNode,
      ),
    ).toEqual([true])
    expect(
      Array.from(xpathPath.css('div#root')).map(
        (item) => item.rawNode === xpathPath.rawNode,
      ),
    ).toEqual([true])
    expect(
      Array.from(fastPath.css('li')).some((item) => item.rawNode === fastPath.rawNode),
    ).toBe(false)
  })
})
