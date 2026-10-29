import { describe, expect, it } from 'vitest'
import {
  MemoryStorageSystem,
  PagePersistenceManager,
  browserDomAdapter,
  captureShadowSnapshot,
  createScrapling,
  isHiddenElement,
  searchSnapshot,
  type DomAdapter,
} from '../src'

describe('Chrome Extension Page Persistence & Browser Features', () => {
  it('persists and auto-relocates live DOM elements across mutations via PagePersistenceManager', async () => {
    const container = document.createElement('div')
    container.innerHTML = `
      <div class="app-shell">
        <div class="card" id="checkout-btn-card">
          <button id="buy-now" class="btn primary">Buy Now</button>
        </div>
      </div>
    `
    document.body.appendChild(container)

    const manager = new PagePersistenceManager({
      document,
      url: 'https://shop.example.com/item/1',
      debounceMs: 10,
    })

    const events: Array<{ tag: string; relocated: boolean; text: string }> = []
    const stopWatching = manager.watch('#buy-now', (el, relocated) => {
      events.push({
        tag: el.tagName.toLowerCase(),
        relocated,
        text: el.textContent?.trim() ?? '',
      })
    })

    expect(events.length).toBe(1)
    expect(events[0]).toEqual({ tag: 'button', relocated: false, text: 'Buy Now' })

    container.innerHTML = `
      <main class="redesigned-shell">
        <section class="action-area">
          <button data-action="purchase" class="btn-v2 primary">Buy Now</button>
        </section>
      </main>
    `

    await new Promise((r) => setTimeout(r, 60))

    expect(events.length).toBe(2)
    expect(events[1].tag).toBe('button')
    expect(events[1].relocated).toBe(true)
    expect(events[1].text).toBe('Buy Now')

    stopWatching()
    await manager.destroy()
    container.remove()
  })

  it('automatically pierces 10 nested Shadow DOM levels and relocates elements inside deep ShadowRoots', async () => {
    const rootHost = document.createElement('div')
    rootHost.id = 'shadow-level-0'
    document.body.appendChild(rootHost)

    let currentParent: Element | ShadowRoot = rootHost
    let deepestShadow: ShadowRoot | null = null

    for (let level = 1; level <= 10; level++) {
      const host = document.createElement('div')
      host.className = `shadow-host-level-${level}`
      currentParent.appendChild(host)
      const sr = host.attachShadow({ mode: 'open' })
      currentParent = sr
      deepestShadow = sr
    }

    deepestShadow!.innerHTML = `
      <div class="deep-panel sc-9a8b7c">
        <button id="deep-pay-btn" class="action-btn css-1x99a2" aria-label="Confirm Order">
          <span><i>Pay $49.00</i></span>
        </button>
      </div>
    `

    const s = createScrapling({
      document,
      url: 'https://deep-shadow.example.com',
      debounceMs: 10,
    })

    const btn = s('#deep-pay-btn')
    expect(btn).not.toBeNull()
    expect(btn?.tagName.toLowerCase()).toBe('button')
    expect(s.text('#deep-pay-btn')).toBe('Pay $49.00')

    const xpathBtn = s('//button[@id="deep-pay-btn"]')
    expect(xpathBtn).toBe(btn)

    deepestShadow!.innerHTML = `
      <section class="redesigned-deep-panel sc-ff0011">
        <div class="wrapper">
          <button class="action-btn css-887766" aria-label="Confirm Order">
            <span><strong>Pay $49.00</strong></span>
          </button>
        </div>
      </section>
    `

    const relocatedBtn = s('#deep-pay-btn')
    expect(relocatedBtn).not.toBeNull()
    expect(relocatedBtn?.getAttribute('aria-label')).toBe('Confirm Order')
    expect(relocatedBtn?.textContent?.trim()).toBe('Pay $49.00')

    const snapshot = captureShadowSnapshot(document)
    expect(snapshot).toContain('Pay $49.00')

    await s.manager.destroy()
    rootHost.remove()
  })

  it('supports zero-config remember, restore, watch, click, and fill via easy API', async () => {
    const container = document.createElement('div')
    container.innerHTML = `
      <div class="checkout-widget">
        <input id="promo-code" class="input-field css-1234abcd" placeholder="Enter promo" value="" />
        <button class="apply-coupon css-9988aabb" data-testid="coupon-submit">
          <span>Apply Coupon</span>
        </button>
      </div>
    `
    document.body.appendChild(container)

    const s = createScrapling({
      document,
      url: 'https://easy-api.example.com',
      debounceMs: 10,
    })

    const originalButton = container.querySelector('button')!
    const savedKey = s.remember(originalButton, 'coupon-btn')
    expect(savedKey).toBe('coupon-btn')

    s.fill('#promo-code', 'SAVE20')
    expect((container.querySelector('#promo-code') as HTMLInputElement).value).toBe('SAVE20')

    container.innerHTML = `
      <div class="new-checkout-v2">
        <div class="row">
          <input class="input-field css-ff009988" placeholder="Enter promo" value="" />
          <button class="apply-coupon css-deadbeef" data-testid="coupon-submit">
            <em>Apply Coupon</em>
          </button>
        </div>
      </div>
    `

    let clickedRelocated = false
    container.querySelector('button')?.addEventListener('click', () => {
      clickedRelocated = true
    })

    const restoredBtn = s.restore('coupon-btn')
    expect(restoredBtn).not.toBeNull()
    expect(restoredBtn?.getAttribute('data-testid')).toBe('coupon-submit')

    const clicked = s.click('.non-existent-old-selector', 'coupon-btn')
    expect(clicked).toBe(true)
    expect(clickedRelocated).toBe(true)

    const filledRelocated = s.fill('#promo-code', 'FIFTY50')
    expect(filledRelocated).toBe(true)
    expect((container.querySelector('input') as HTMLInputElement).value).toBe('FIFTY50')

    await s.manager.destroy()
    container.remove()
  })

  it('automatically triggers onRelocate callback with old fingerprint and new element on card scraping', async () => {
    const container = document.createElement('div')
    container.innerHTML = `
      <div id="mosaic-provider-jobcards">
        <div class="job_seen_beacon">
          <h2 class="jobTitle"><a class="jcs-JobTitle" data-jk="jk-101" href="/job1"><span id="jobTitle-101">Senior TypeScript Engineer</span></a></h2>
          <div data-testid="company-name">Acme Corp</div>
          <div data-testid="text-location">Remote</div>
          <div class="meta-tags">
            <span class="css-zydy3i">$150,000 - $180,000 a year</span>
            <span class="css-zydy3i">Full-time</span>
          </div>
          <span class="mosaic-provider-jobcards-1k6cgqp">Easily apply</span>
        </div>
        <div class="job_seen_beacon">
          <h2 class="jobTitle"><a class="jcs-JobTitle" data-jk="jk-102" href="/job2"><span id="jobTitle-102">Backend Developer</span></a></h2>
          <div data-testid="company-name">Beta Inc</div>
          <div data-testid="text-location">New York, NY</div>
          <div class="meta-tags">
            <span class="css-zydy3i">$130,000 a year</span>
            <span class="css-zydy3i">Contract</span>
          </div>
        </div>
      </div>
    `
    document.body.appendChild(container)

    const s = createScrapling({
      document,
      url: 'https://indeed.example.com/jobs',
      debounceMs: 10,
    })

    const analyticsEvents: Array<{
      brokenSelector: string
      oldClass: string | undefined
      newClass: string
      newCssSelector: string
      score: number
    }> = []

    s.onRelocate((oldEl, newEl, event) => {
      analyticsEvents.push({
        brokenSelector: event.brokenSelector,
        oldClass: oldEl.attributes.class,
        newClass: newEl.className,
        newCssSelector: event.newCssSelector,
        score: event.score,
      })
    })

    const PRIMARY_LINK_SELECTORS = [
      'h2.jobTitle a.jcs-JobTitle[data-jk]',
      'h2.jobTitle a[data-jk]',
      'a.jcs-JobTitle[data-jk]',
      'a[data-jk]',
    ]
    const isValidLink = (a: HTMLAnchorElement) =>
      !a.getAttribute('href')?.includes('addlloc')

    const initialCards = s.all('.job_seen_beacon', container)
    expect(initialCards.length).toBe(2)

    const card0 = s.in(initialCards[0])
    const link0 = card0<HTMLAnchorElement>(PRIMARY_LINK_SELECTORS, isValidLink)
    expect(link0?.getAttribute('data-jk')).toBe('jk-101')
    expect(card0.text('[id^="jobTitle-"]')).toBe('Senior TypeScript Engineer')
    expect(card0.text('[data-testid="company-name"]')).toBe('Acme Corp')
    expect(card0.texts('span.css-zydy3i')).toEqual([
      '$150,000 - $180,000 a year',
      'Full-time',
    ])
    expect(card0('.mosaic-provider-jobcards-1k6cgqp')).not.toBeNull()
    expect(analyticsEvents.length).toBe(0)

    container.innerHTML = `
      <div id="mosaic-provider-jobcards">
        <div class="job_card_redesigned_v2">
          <h2 class="jobTitle"><a class="new-link-class" data-job-key="jk-101" href="/job1"><span id="jobTitle-101">Senior TypeScript Engineer</span></a></h2>
          <div data-testid="company-name">Acme Corp</div>
          <div data-testid="text-location">Remote</div>
          <div class="meta-tags">
            <span class="css-9988aabb">$150,000 - $180,000 a year</span>
            <span class="css-9988aabb">Full-time</span>
          </div>
          <span class="mosaic-provider-jobcards-xyz999">Easily apply</span>
        </div>
        <div class="job_card_redesigned_v2">
          <h2 class="jobTitle"><a class="new-link-class" data-job-key="jk-102" href="/job2"><span id="jobTitle-102">Backend Developer</span></a></h2>
          <div data-testid="company-name">Beta Inc</div>
          <div data-testid="text-location">New York, NY</div>
          <div class="meta-tags">
            <span class="css-9988aabb">$130,000 a year</span>
            <span class="css-9988aabb">Contract</span>
          </div>
        </div>
      </div>
    `

    const relocatedCards = s.all('.job_seen_beacon', container)
    expect(relocatedCards.length).toBe(2)

    const relocatedCard0 = s.in(relocatedCards[0])
    const relocatedLink0 = relocatedCard0<HTMLAnchorElement>(
      PRIMARY_LINK_SELECTORS,
      isValidLink,
    )
    expect(relocatedLink0?.getAttribute('href')).toBe('/job1')
    expect(relocatedCard0.texts('span.css-zydy3i')).toEqual([
      '$150,000 - $180,000 a year',
      'Full-time',
    ])
    expect(relocatedCard0('.mosaic-provider-jobcards-1k6cgqp')?.textContent).toBe(
      'Easily apply',
    )

    expect(analyticsEvents.length).toBe(4)
    expect(analyticsEvents.map((e) => e.brokenSelector)).toEqual([
      '.job_seen_beacon',
      'h2.jobTitle a.jcs-JobTitle[data-jk]',
      'span.css-zydy3i',
      '.mosaic-provider-jobcards-1k6cgqp',
    ])

    await s.manager.destroy()
    container.remove()
  })

  it('supports custom save and read predicates with MemoryStorageSystem and PagePersistenceManager', async () => {
    const el = document.createElement('a')
    el.setAttribute('href', '/profile')
    el.className = 'nav-link'
    el.textContent = 'My Profile'

    const customStore = new Map<string, unknown>()
    const storage = new MemoryStorageSystem({
      url: 'https://app.example.com',
      save: (key, fp) => {
        customStore.set(key, fp)
      },
      read: (key) => {
        const val = customStore.get(key)
        return val ? (val as ReturnType<typeof storage.retrieve>) : null
      },
    })
    storage.save(el, 'profile-link')
    expect(storage.retrieve('profile-link')?.text).toBe('My Profile')
    expect(customStore.has('example.com:::profile-link')).toBe(true)

    customStore.delete('example.com:::profile-link')
    storage.delete('profile-link')
    expect(storage.retrieve('profile-link')).toBeNull()

    const manager = new PagePersistenceManager({
      document,
      url: 'https://app.example.com',
      storage,
    })
    storage.save(el, 'manager-profile')
    expect(manager.page.retrieve('manager-profile')?.text).toBe('My Profile')
    await manager.destroy()
  })

  it('detects hidden elements and searches snapshots', () => {
    const div1 = document.createElement('div')
    div1.setAttribute('style', 'display: none !important')
    expect(isHiddenElement(div1)).toBe(true)

    const div2 = document.createElement('div')
    div2.setAttribute('style', 'opacity: 0.95; line-height: 0')
    expect(isHiddenElement(div2)).toBe(false)

    const snap = [
      '- document:',
      '  - main:',
      '    - article:',
      '      - heading "Target Item"',
      '      - paragraph "Price $10"',
      '    - footer:',
      '      - text "Copyright"',
    ].join('\n')
    const filtered = searchSnapshot(snap, /Target Item/)
    expect(filtered).toContain('- document:')
    expect(filtered).toContain('heading "Target Item"')
  })

  it('fills contenteditable hosts through scrapling.fill', async () => {
    const wrapper = document.createElement('div')
    wrapper.innerHTML = `
      <div id="editor" contenteditable="true"></div>
    `
    document.body.appendChild(wrapper)

    const editor = wrapper.querySelector('#editor') as HTMLElement
    let inputFired = false
    editor.addEventListener('input', () => {
      inputFired = true
    })

    const scrapling = createScrapling({ document })
    expect(scrapling.fill('#editor', 'Hello')).toBe(true)
    expect(editor.textContent).toBe('Hello')
    expect(editor.isContentEditable).toBe(true)
    expect(inputFired).toBe(true)

    await scrapling.manager.destroy()
    wrapper.remove()
  })

  it('supports waitFor, waitUntil, isVisible, attr, and check helpers', async () => {
    const container = document.createElement('div')
    container.innerHTML = `
      <div class="card">
        <img src="https://cdn.example.com/logo.png" alt="Logo" />
        <input id="rememberMeOptIn-checkbox" type="checkbox" />
      </div>
    `
    document.body.appendChild(container)

    const s = createScrapling({
      document,
      url: 'https://helpers.example.com',
      debounceMs: 10,
    })

    const c = s.in(container)
    expect(c.attr('img', 'src')).toBe('https://cdn.example.com/logo.png')
    expect(c.check('#rememberMeOptIn-checkbox', true)).toBe(true)
    expect(
      (container.querySelector('#rememberMeOptIn-checkbox') as HTMLInputElement)
        .checked,
    ).toBe(true)

    setTimeout(() => {
      const modal = document.createElement('div')
      modal.setAttribute('data-zds-component', 'modal')
      modal.style.width = '200px'
      modal.style.height = '100px'
      modal.innerHTML = '<input type="email" value="" /><button type="submit">Continue</button>'
      container.appendChild(modal)
    }, 30)

    const modal = await s.waitFor('[data-zds-component="modal"]', {
      root: container,
      visible: true,
      timeout: 1000,
    })
    expect(modal).not.toBeNull()
    expect(s.isVisible(modal)).toBe(true)

    let stateValue = 'old'
    setTimeout(() => {
      stateValue = 'new-job-id-42'
    }, 30)

    const nextId = await s.waitUntil(
      () => (stateValue !== 'old' ? stateValue : null),
      1000,
      15,
    )
    expect(nextId).toBe('new-job-id-42')

    await s.manager.destroy()
    container.remove()
  })

  it('debounces a burst of mutations into one evaluation instead of one per batch', async () => {
    let fire: (() => void) | null = null
    const adapter: DomAdapter = {
      ...browserDomAdapter,
      createObserver: (callback) => {
        fire = () => callback([])
        return {
          observe: () => {},
          disconnect: () => {
            fire = null
          },
        }
      },
    }

    const manager = new PagePersistenceManager({
      document,
      dom: adapter,
      debounceMs: 5,
      adaptiveDomain: 'waiter-debounce',
    })

    let checks = 0
    const pending = manager.waitUntil(() => {
      checks++
      return null
    }, 500, 100)

    expect(checks).toBe(1)
    for (let i = 0; i < 50; i++) {
      fire?.()
    }
    expect(checks).toBe(1)

    await new Promise((resolve) => setTimeout(resolve, 40))
    expect(checks).toBe(2)

    await manager.destroy()
    await pending
  })

  it('runs pseudo-CSS and bare $variable selectors as CSS instead of searching for their literal text', () => {
    const container = document.createElement('div')
    container.innerHTML = `
      <ul id="modes">
        <li data-sku="SKU-1">Alpha</li>
        <li data-sku="SKU-2">Beta</li>
      </ul>
      <p class="note">Amount: $10 (approx</p>
    `
    document.body.appendChild(container)

    const manager = new PagePersistenceManager({
      document,
      url: 'https://modes.example.com',
    })

    expect(manager.find('li:contains("Beta")')?.textContent).toBe('Beta')
    expect(manager.findAll('li:contains("Al")').length).toBe(1)
    expect(
      manager
        .resolve('li[data-sku=$sku]', { variables: { sku: 'SKU-2' } })[0]
        ?.text.toString(),
    ).toBe('Beta')
    expect(manager.find('Amount: $10 (approx')?.textContent).toContain('Amount')

    container.remove()
  })
})
