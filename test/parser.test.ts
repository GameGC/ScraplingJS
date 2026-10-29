import { describe, expect, it } from 'vitest'
import {
  AttributesHandler,
  Selector,
  SelectorSyntaxError,
  Selectors,
  TextHandler,
  TextHandlers,
} from '../src'

const COMPLEX_HTML = `
<html>
<head>
    <title>Complex Web Page</title>
    <style>
        .hidden { display: none; }
    </style>
</head>
<body>
    <header>
        <nav>
            <ul>
                <li><a href="#home">Home</a></li>
                <li><a href="#about">About</a></li>
                <li><a href="#contact">Contact</a></li>
            </ul>
        </nav>
    </header>
    <main>
        <section id="products" schema='{"jsonable": "data"}'>
            <h2>Products</h2>
            <div class="product-list">
                <article class="product" data-id="1">
                    <h3>Product 1</h3>
                    <p class="description">This is product 1</p>
                    <span class="price">$10.99</span>
                    <div class="hidden stock">In stock: 5</div>
                </article>
                <article class="product" data-id="2">
                    <h3>Product 2</h3>
                    <p class="description">This is product 2</p>
                    <span class="price">$20.99</span>
                    <div class="hidden stock">In stock: 3</div>
                </article>
                <article class="product" data-id="3">
                    <h3>Product 3</h3>
                    <p class="description">This is product 3</p>
                    <span class="price">$15.99</span>
                    <div class="hidden stock">Out of stock</div>
                </article>
            </div>
        </section>
        <section id="reviews">
            <h2>Customer Reviews</h2>
            <div class="review-list">
                <div class="review" data-rating="5">
                    <p class="review-text">Great product!</p>
                    <span class="reviewer">John Doe</span>
                </div>
                <div class="review" data-rating="4">
                    <p class="review-text">Good value for money.</p>
                    <span class="reviewer">Jane Smith</span>
                </div>
            </div>
        </section>
    </main>
    <footer>
        <p>&copy; 2024 Our Company</p>
    </footer>
    <script id="page-data" type="application/json">
        {"lastUpdated": "2024-09-22T10:30:00Z", "totalProducts": 3}
    </script>
</body>
</html>
`

describe('Selector & Selectors Core', () => {
  it('selects basic and :not(:contains()) CSS selectors', () => {
    const page = new Selector(COMPLEX_HTML, {})
    const elements = page.css('main #products .product-list article.product')
    expect(elements.length).toBe(3)

    const inStock = page.css(
      'main #products .product-list article.product:not(:contains("Out of stock"))',
    )
    expect(inStock.length).toBe(2)
  })

  it('selects via XPath and XPath variables', () => {
    const page = new Selector(COMPLEX_HTML, {})
    const reviews = page.xpath(
      '//section[@id="reviews"]//div[contains(@class, "review") and @data-rating >= 4]',
    )
    expect(reviews.length).toBe(2)

    const highPriced = page.xpath(
      '//article[contains(@class, "product")][number(translate(substring-after(.//span[@class="price"], "$"), ",", "")) > 15]',
    )
    expect(highPriced.length).toBe(2)

    const byVar = page.xpath('//h3[text()=$title]', { title: 'Product 2' })
    expect(byVar.length).toBe(1)
    expect(byVar[0].text.toString()).toBe('Product 2')
  })

  it('supports ::text and ::attr() pseudo-elements', () => {
    const page = new Selector(COMPLEX_HTML)
    const titles = page.css('article.product h3::text')
    expect(titles.length).toBe(3)
    expect(titles[0]).toBeInstanceOf(Selector)
    expect(titles[0].tag).toBe('#text')
    expect(titles.getall().toStrings()).toEqual(['Product 1', 'Product 2', 'Product 3'])

    const ids = page.css('article.product::attr(data-id)')
    expect(ids.getall().toStrings()).toEqual(['1', '2', '3'])
  })

  it('matches text via findByText and findByRegex', () => {
    const page = new Selector(COMPLEX_HTML)
    const stockRegexAll = page.findByRegex(/In stock: \d+/, false)
    expect(stockRegexAll.length).toBe(2)

    const stockFirst = page.findByRegex('In stock: \\d+', {
      firstMatch: true,
      caseSensitive: true,
    })
    expect(stockFirst?.text.toString()).toBe('In stock: 5')

    const partialStock = page.findByText('In stock:', {
      partial: true,
      firstMatch: false,
    })
    expect(partialStock.length).toBe(2)

    const exactOut = page.findByText('Out of stock', {
      partial: false,
      firstMatch: false,
    })
    expect(exactOut.length).toBe(1)
  })

  it('finds similar elements with attribute and text thresholds', () => {
    const page = new Selector(COMPLEX_HTML)
    const firstProduct = page.css('.product').first!
    const similarProducts = firstProduct.findSimilar()
    expect(similarProducts.length).toBe(2)

    const html = `
      <html><body>
        <div class="cards">
          <div class="card" data-kind="primary" data-color="red" data-size="large">Alpha</div>
          <div class="card">Beta</div>
          <div class="card" data-kind="primary" data-color="red" data-size="large" data-id="x">Gamma</div>
          <div class="card" data-kind="primary" data-color="red" data-size="large">Delta</div>
        </div>
      </body></html>
    `
    const cardPage = new Selector(html)
    const firstCard = cardPage.css('div.card')[0]
    const similarCards = firstCard.findSimilar({
      similarityThreshold: 0.9,
      ignoreAttributes: [],
    })
    const cardTexts = similarCards.map((el) => el.text.toString())
    expect(cardTexts).toContain('Delta')
    expect(cardTexts).not.toContain('Beta')
    expect(cardTexts).not.toContain('Gamma')
  })

  it('supports findAll and find with classes, escaped attributes, regex, and functions', () => {
    const page = new Selector(COMPLEX_HTML)
    expect(page.findAll('div', { class_: 'stock' }).length).toBe(3)
    expect(page.findAll('div', { class_: 'hidden stock' }).length).toBe(3)
    expect(page.findAll('div', { class_: 'stock hidden' }).length).toBe(3)
    expect(page.findAll('div', { class_: 'hidden nonexistent' }).length).toBe(0)

    const blankClassPage = new Selector(
      '<div class="">empty</div><div class="a">a</div><div>none</div>',
    )
    expect(
      blankClassPage.findAll('div', { class_: '' }).map((e) => e.getAllText().toString()),
    ).toEqual(['empty'])
    expect(blankClassPage.findAll('div', { class_: '   ' }).length).toBe(0)

    const escapedPage = new Selector(
      '<a title=\'say "hi"\'>quoted</a><a title="one\ntwo">broken</a>',
    )
    expect(escapedPage.find('a', { title: 'say "hi"' })?.getAllText().toString()).toBe('quoted')
    expect(escapedPage.find('a', { title: 'one\ntwo' })?.getAllText().toString()).toBe('broken')
  })

  it('traverses DOM tree and ancestors accurately', () => {
    const page = new Selector(COMPLEX_HTML)
    const table = page.css('.product-list')[0]
    const parent = table.parent!
    expect(parent['id'].toString()).toBe('products')
    expect(parent.siblings.length).toBe(1)
    expect(table.children.length).toBe(3)

    const firstChild = table.find({ 'data-id': '1' })!
    const nextEl = firstChild.next!
    expect(nextEl.attrib['data-id'].toString()).toBe('2')
    expect(nextEl.previous?.tag).toBe(firstChild.tag)

    const allPrices = page.css('.price')
    const productsWithPrices = allPrices.map((p) =>
      p.findAncestor((anc) => anc.hasClass('product')),
    )
    expect(productsWithPrices.every((p) => p !== null)).toBe(true)
    expect(productsWithPrices.length).toBe(3)
  })

  it('generates round-trip CSS and XPath selectors', () => {
    const cases: Array<[string, string, string, string]> = [
      [
        '<section><p>A</p><p>B</p></section>',
        'p:first-of-type',
        'body > section > p:nth-of-type(1)',
        '//body/section/p[1]',
      ],
      [
        '<section><p>A</p><p>B</p></section>',
        'p:nth-of-type(2)',
        'body > section > p:nth-of-type(2)',
        '//body/section/p[2]',
      ],
      [
        '<section><span>before</span><p>A</p><em>after</em></section>',
        'p',
        'body > section > p',
        '//body/section/p',
      ],
    ]

    for (const [inner, targetCss, expectedCss, expectedXpath] of cases) {
      const page = new Selector(`<html><body>${inner}</body></html>`)
      const target = page.css(targetCss).first!
      expect(target.generateCssSelector).toBe(expectedCss)
      expect(target.generateXpathSelector).toBe(expectedXpath)
      expect(page.css(target.generateCssSelector).first?.rawNode).toBe(target.rawNode)
      expect(page.xpath(target.generateXpathSelector).first?.rawNode).toBe(target.rawNode)
    }

    const idPage = new Selector(
      '<html><body><div id="main"><p id="target">Hello</p></div></body></html>',
    )
    const idTarget = idPage.css('#target').first!
    expect(idTarget.generateCssSelector).toBe('#target')
    expect(idTarget.generateFullCssSelector).toBe('body > #main > #target')
    expect(idTarget.generateXpathSelector).toBe("//*[@id='target']")
    expect(idTarget.generateFullXpathSelector).toBe("//body/*[@id='main']/*[@id='target']")
  })

  it('handles TextHandler, TextHandlers, and AttributesHandler operations', () => {
    const page = new Selector(COMPLEX_HTML)
    const scriptContent = page.css('#page-data::text')[0].get()
    expect(scriptContent).toBeInstanceOf(TextHandler)
    const parsedJson = scriptContent.json()
    expect(parsedJson.totalProducts).toBe(3)

    const text = new TextHandler('Price: $10.99, Sale: $8.99')
    const prices = text.re(/\$[\d.]+/) as TextHandlers
    expect(prices.toStrings()).toEqual(['$10.99', '$8.99'])
    expect(text.re(/\$[\d.]+/, { checkMatch: true })).toBe(true)

    const groups = new TextHandler('name=Alice age=30 name=Bob age=25').re(
      /name=(\w+) age=(\d+)/,
    ) as TextHandlers
    expect(groups.toStrings()).toEqual(['Alice', '30', 'Bob', '25'])

    const section = page.css('#products').first!
    expect(section.attrib).toBeInstanceOf(AttributesHandler)
    expect('schema' in section).toBe(true)
    expect(section.attrib['schema'].json()).toEqual({ jsonable: 'data' })
    expect(Array.from(section.attrib.searchValues('products')).length).toBe(1)
  })

  it('throws SelectorSyntaxError on invalid CSS or XPath selectors', () => {
    const page = new Selector(COMPLEX_HTML)
    expect(() => page.css('4 ayo')).toThrow(SelectorSyntaxError)
    expect(() => page.xpath('4 ayo')).toThrow(SelectorSyntaxError)
  })

  it('escapes text and attributes in prettify without closing void elements', () => {
    const wrapper = document.createElement('div')
    wrapper.setAttribute('title', 'a "b" & <c>')
    const image = document.createElement('img')
    image.setAttribute('src', '/logo.png?a=1&b=2')
    const paragraph = document.createElement('p')
    paragraph.textContent = '1 < 2 & 3 > 0'
    wrapper.append(image, paragraph)

    const pretty = new Selector(wrapper).prettify().toString()
    expect(pretty).toContain('title="a &quot;b&quot; &amp; &lt;c&gt;"')
    expect(pretty).toContain('<img src="/logo.png?a=1&amp;b=2">')
    expect(pretty).not.toContain('</img>')
    expect(pretty).toContain('1 &lt; 2 &amp; 3 &gt; 0')
  })
})
