/**
 * Shared fixture and story for the browser-driver demos.
 *
 * The story is driver-agnostic: it needs page HTML, one element handle and a
 * way to mutate the page. Everything else lives in the library.
 */
import {
  MemoryStorageSystem,
  Selector,
  type DomAdapter,
} from 'scrapling-js'

export const SHOP_URL = 'https://shop.example/product/x100'

export const SHOP_V1 = `<!DOCTYPE html>
<html>
<head><title>Mechanical Keyboard X100</title></head>
<body>
  <main class="product-page">
    <h1 class="product-title">Mechanical Keyboard X100</h1>
    <div id="add-to-cart" class="product-action">
      <span class="price">$29.99</span>
      <span class="stock">In stock</span>
      <button class="btn btn-buy-now" type="button">Add to cart</button>
      <a class="wishlist" href="/wishlist">Save for later</a>
    </div>
    <p class="shipping-note">Ships in 2 days</p>
  </main>
</body>
</html>`

export const SHOP_V2 = `<!DOCTYPE html>
<html>
<head><title>Mechanical Keyboard X100</title></head>
<body>
  <main class="product-page">
    <h1 class="Typography_heading__7j2k1">Mechanical Keyboard X100</h1>
    <div class="ProductActions_root__9x2f1">
      <div class="ProductActions_meta__k3j4h">
        <span class="Price_price__p81m">$29.99</span>
        <span class="Price_note__z1">incl. tax</span>
      </div>
      <div class="ProductActions_ctaWrap__q7">
        <a class="Link_link__x1" href="/wishlist">Save for later</a>
        <button class="Button_primary__aBc12" type="button">Add to cart</button>
      </div>
    </div>
    <p class="Shipping_note__m4">Ships in 2 days</p>
  </main>
</body>
</html>`

export interface DemoPage {
  content(): string | Promise<string>
  $(selector: string): Promise<unknown>
  redesign(): Promise<void>
}

/** Runs inside the browser page, so it must not close over Node values. */
export function redesignSite(): string {
  const old = document.querySelector('#add-to-cart')
  if (!old) return 'already-redesigned'
  const price = old.querySelector('.price')?.textContent ?? ''
  old.remove()
  document.querySelector('.product-page')?.insertAdjacentHTML(
    'beforeend',
    `<div class="ProductActions_root__9x2f1">
       <div class="ProductActions_meta__k3j4h">
         <span class="Price_price__p81m">${price}</span>
         <span class="Price_note__z1">incl. tax</span>
       </div>
       <div class="ProductActions_ctaWrap__q7">
         <a class="Link_link__x1" href="/wishlist">Save for later</a>
         <button class="Button_primary__aBc12" type="button">Add to cart</button>
       </div>
     </div>`,
  )
  return 'redesigned'
}

export async function runShopStory(page: DemoPage): Promise<void> {
  const mark = (ok: boolean): string => (ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m')

  console.log('\n\x1b[1m[A] Page snapshot: Selector.fromPage(page)\x1b[0m')
  const snapshot = await Selector.fromPage(page, { url: SHOP_URL })
  const title = snapshot.css('h1.product-title')[0]
  const price = snapshot.xpath('//div[@id="add-to-cart"]/span[contains(@class, "price")]')[0]
  const buttons = snapshot.find_all('#add-to-cart button')
  console.log(`    ${mark(Boolean(title))} CSS:   ${title ? String(title.text).trim() : '—'}`)
  console.log(`    ${mark(Boolean(price))} XPath: ${price ? String(price.text).trim() : '—'}`)
  console.log(`    ${mark(buttons.length === 1)} find_all: ${buttons.length} button(s)`)

  console.log('\n\x1b[1m[B] Element snapshot: Selector.fromHandle(handle)\x1b[0m')
  const handle = await page.$('#add-to-cart .btn-buy-now')
  if (!handle) throw new Error('Fixture changed: the buy button is missing from v1')
  const button = await Selector.fromHandle(handle)
  console.log(
    `    ${mark(true)} <${button.tag}> "${String(button.text).trim()}" (type="${button.attr('type') ?? '—'}")`,
  )

  console.log('\n\x1b[1m[C] Adaptive relocation after a redesign\x1b[0m')
  const storage = new MemoryStorageSystem({ url: SHOP_URL })
  const before = await Selector.fromPage(page, { url: SHOP_URL, storage })
  const target = before.css('#add-to-cart .btn-buy-now')[0]
  if (!target) throw new Error('Fixture changed: the buy button cannot be saved')
  before.save(target, 'buy-button')

  await page.redesign()

  const after = await Selector.fromPage(page, { url: SHOP_URL, storage })
  const dead = after.rawNode?.querySelectorAll('#add-to-cart .btn-buy-now').length ?? 0
  const found = after.css('#add-to-cart .btn-buy-now', {
    identifier: 'buy-button',
    percentage: 30,
  })

  console.log(`    ${mark(dead === 0)} old selector is dead: ${dead} match(es)`)
  if (found.length === 0 || !found[0]) {
    console.log('    \x1b[31m✗\x1b[0m relocation failed')
    return
  }
  const score = target.similarityTo(found[0])
  console.log(
    `    ${mark(score >= 30)} relocated: "${String(found[0].text).trim()}" ` +
      `(score ${score.toFixed(1)}%, threshold 30%)`,
  )
}

interface FakeHandle {
  evaluate<R>(pageFunction: (element: Element) => R): Promise<R>
  asElement(): FakeHandle
}

function fakeHandle(outerHTML: string): FakeHandle {
  const handle: FakeHandle = {
    evaluate: <R>(pageFunction: (element: Element) => R): Promise<R> =>
      Promise.resolve(pageFunction({ outerHTML } as Element)),
    asElement: () => handle,
  }
  return handle
}

/** Last-resort mode: no browser installed, same story on the Node adapter. */
export function createOfflinePage(adapter: DomAdapter): DemoPage {
  let html = SHOP_V1
  return {
    content: () => html,
    async $(selector) {
      const element = adapter.parseHtml(html).querySelector(selector)
      return element ? fakeHandle(element.outerHTML) : null
    },
    async redesign() {
      html = SHOP_V2
    },
  }
}
