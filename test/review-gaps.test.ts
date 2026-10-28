import { beforeEach, describe, expect, it } from 'vitest'
import {
  MemoryStorageSystem,
  PagePersistenceManager,
  Selector,
  calculateSimilarityScore,
  generateElementSelector,
  htmlToMarkdown,
  isElementVisible,
  isValidFingerprint,
  replaceEntities,
  runBrowserActions,
  searchSnapshot,
  setNativeCheckboxValue,
  setNativeInputValue,
  type ElementFingerprint,
} from '../src'

describe('12 Review Test-Gaps Suite', () => {
  beforeEach(() => {
    MemoryStorageSystem.clearAll()
  })

  describe('Gap 1: timeout: 0 in browser-actions.ts', () => {
    it('executes a single immediate check when timeout is 0 and rejects quickly without hanging', async () => {
      const container = document.createElement('div')
      container.id = 'timeout-container'
      document.body.appendChild(container)

      const start = Date.now()
      let errorThrown: Error | null = null
      try {
        await runBrowserActions(
          [{ type: 'wait_element', target: '#nonexistent-element-xyz', timeout: 0 }],
          { document },
        )
      } catch (err: unknown) {
        errorThrown = err instanceof Error ? err : new Error(String(err))
      } finally {
        container.remove()
      }

      const elapsed = Date.now() - start
      expect(errorThrown).not.toBeNull()
      expect(errorThrown?.message).toMatch(/timeout|failed/i)
      expect(elapsed).toBeLessThan(1000)
    }, 2000)

    it('resolves immediately when timeout is 0 if target element is already present and attached', async () => {
      const container = document.createElement('div')
      container.id = 'already-present'
      container.style.display = 'block'
      container.style.width = '100px'
      container.style.height = '50px'
      container.textContent = 'Ready'
      document.body.appendChild(container)

      const start = Date.now()
      try {
        await runBrowserActions(
          [{ type: 'wait_element', target: '#already-present', state: 'attached', timeout: 0 }],
          { document },
        )
      } finally {
        container.remove()
      }

      const elapsed = Date.now() - start
      expect(elapsed).toBeLessThan(500)
    }, 2000)

    it('cancels immediately when an AbortSignal is passed and already aborted', async () => {
      const ac = new AbortController()
      ac.abort()

      let rejected = false
      try {
        await runBrowserActions(
          [
            {
              type: 'wait_element',
              target: '#never-existing',
              timeout: 400,
              signal: ac.signal,
            },
          ],
          { document },
        )
      } catch {
        rejected = true
      }
      expect(rejected).toBe(true)
    }, 1500)

    it('cleans up abort listener on normal completion of wait_time action', async () => {
      const ac = new AbortController()
      let listenerCount = 0
      const origAdd = ac.signal.addEventListener.bind(ac.signal)
      const origRemove = ac.signal.removeEventListener.bind(ac.signal)
      ac.signal.addEventListener = (type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
        if (type === 'abort') listenerCount++
        return origAdd(type, listener, options)
      }
      ac.signal.removeEventListener = (type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions) => {
        if (type === 'abort') listenerCount--
        return origRemove(type, listener, options)
      }

      await runBrowserActions(
        [{ type: 'wait_time', milliseconds: 10, signal: ac.signal }],
        { document },
      )

      expect(listenerCount).toBe(0)
    })
  })

  describe('Gap 2: wait_load in iframe (doc.defaultView)', () => {
    it('attaches load listener to doc.defaultView rather than window and respects iframe state', async () => {
      const iframe = document.createElement('iframe')
      document.body.appendChild(iframe)

      const iframeDoc = iframe.contentDocument
      expect(iframeDoc).not.toBeNull()
      expect(iframeDoc?.defaultView).toBe(iframe.contentWindow)

      if (iframeDoc) {
        const start = Date.now()
        await runBrowserActions(
          [{ type: 'wait_load', state: 'domcontentloaded', timeout: 500 }],
          { document: iframeDoc },
        )
        const elapsed = Date.now() - start
        expect(elapsed).toBeLessThan(600)
      }

      iframe.remove()
    })
  })

  describe('Gap 3: Hydrate merge race condition', () => {
    it('preserves newer in-memory entries when an older or conflicting snapshot is hydrated', async () => {
      const storage = new MemoryStorageSystem({
        url: 'https://race.example.com',
      })

      const inMemoryFp: ElementFingerprint = {
        tag: 'button',
        attributes: { id: 'race-btn', class: 'btn primary v2' },
        text: 'Version 2 (Active)',
        path: ['button'],
      }
      storage.save(inMemoryFp, 'race-button')

      const staleSnapshot: Record<string, ElementFingerprint> = {
        'example.com:::race-button': {
          tag: 'button',
          attributes: { id: 'race-btn', class: 'btn primary v1' },
          text: 'Version 1 (Stale)',
          path: ['button'],
        },
        'example.com:::new-entry': {
          tag: 'span',
          attributes: { id: 'status' },
          text: 'Active Status',
          path: ['span'],
        },
      }

      await storage.hydrate(staleSnapshot)

      const activeRetrieved = storage.retrieve('race-button')
      expect(activeRetrieved).not.toBeNull()
      expect(activeRetrieved?.text).toBe('Version 2 (Active)')
      expect(activeRetrieved?.attributes.class).toBe('btn primary v2')

      const newRetrieved = storage.retrieve('new-entry')
      expect(newRetrieved).not.toBeNull()
      expect(newRetrieved?.text).toBe('Active Status')
    })
  })

  describe('Gap 4: $& and special replacement tokens in XPath variables', () => {
    it('safely substitutes variables containing $&, $`, $\', and numbers without corruption', () => {
      const html = `
        <div id="wrapper">
          <span id="price-dollar">Prices: $& and $100</span>
          <span id="quote-special">Special: quote ' $\` $' end</span>
          <span id="numeric-item">Item count 42</span>
        </div>
      `
      const page = new Selector(html, { adaptive: false })

      const res1 = page.xpath('//span[text()=$val]', {
        variables: { val: 'Prices: $& and $100' },
      })
      expect(res1.length).toBe(1)
      expect(res1[0].attrib.id.toString()).toBe('price-dollar')

      const res2 = page.xpath('//span[text()=$val]', {
        variables: { val: "Special: quote ' $` $' end" },
      })
      expect(res2.length).toBe(1)
      expect(res2[0].attrib.id.toString()).toBe('quote-special')

      const res3 = page.xpath('//span[contains(text(), $count)]', {
        variables: { count: 42 },
      })
      expect(res3.length).toBe(1)
      expect(res3[0].attrib.id.toString()).toBe('numeric-item')
    })
  })

  describe('Gap 5: css() selector with variables interpolation', () => {
    it('interpolates string and numeric variables in css() query matching xpath() behavior', () => {
      const html = `
        <section id="catalog">
          <article data-category="electronics" data-user="alice" data-id="101">
            <h3>Laptop</h3>
          </article>
          <article data-category="books" data-user="bob" data-id="202">
            <h3>Novel</h3>
          </article>
        </section>
      `
      const page = new Selector(html, { adaptive: false })

      const res1 = page.css('article[data-category=$cat][data-user=$usr]', {
        variables: { cat: 'electronics', usr: 'alice' },
      })
      expect(res1.length).toBe(1)
      expect(res1[0].attrib['data-id'].toString()).toBe('101')
      expect(res1[0].css('h3')[0].text.toString()).toBe('Laptop')

      const res2 = page.css('article[data-id=$id]', {
        variables: { id: 202 },
      })
      expect(res2.length).toBe(1)
      expect(res2[0].css('h3')[0].text.toString()).toBe('Novel')
    })

    it('supports variables interpolation when querying from Selectors collection via css()', () => {
      const html = `
        <div id="container">
          <section class="group">
            <span data-tag="alpha">A</span>
            <span data-tag="beta">B</span>
          </section>
        </div>
      `
      const page = new Selector(html, { adaptive: false })
      const groups = page.css('.group')
      const matched = groups.css('span[data-tag=$target]', {
        variables: { target: 'beta' },
      })
      expect(matched.length).toBe(1)
      expect(matched[0].text.toString()).toBe('B')
    })
  })

  describe('Gap 6: /g and /y stateful regexes in searchSnapshot', () => {
    it('matches consecutive lines without skipping when /g or /y regex flags are used', () => {
      const snapshot = [
        '- document:',
        '  - main:',
        '    - section "Header Section":',
        '      - paragraph "TARGET_TOKEN First"',
        '      - paragraph "TARGET_TOKEN Second"',
        '      - paragraph "Other line"',
        '    - footer:',
        '      - paragraph "TARGET_TOKEN Third"',
      ].join('\n')

      const resultG = searchSnapshot(snapshot, /TARGET_TOKEN/g)
      expect(resultG).toContain('TARGET_TOKEN First')
      expect(resultG).toContain('TARGET_TOKEN Second')
      expect(resultG).toContain('TARGET_TOKEN Third')

      const resultY = searchSnapshot(snapshot, /TARGET_TOKEN/y)
      expect(resultY).toContain('TARGET_TOKEN First')
      expect(resultY).toContain('TARGET_TOKEN Second')
      expect(resultY).toContain('TARGET_TOKEN Third')
    })
  })

  describe('Gap 7: onLost callback in PagePersistenceManager', () => {
    it('triggers onLost callback when a watched element can no longer be found or relocated', async () => {
      const container = document.createElement('div')
      container.id = 'watch-container'
      container.innerHTML = `
        <button id="monitored-action" class="btn primary">Execute</button>
      `
      document.body.appendChild(container)

      const manager = new PagePersistenceManager({
        document,
        url: 'https://onlost.example.com',
        debounceMs: 15,
      })

      let resolvedCalls = 0
      let lostCalls = 0

      const stop = manager.watchElement({
        selector: '#monitored-action',
        onResolved: () => {
          resolvedCalls++
        },
        onLost: () => {
          lostCalls++
        },
      })

      expect(resolvedCalls).toBe(1)
      expect(lostCalls).toBe(0)

      container.innerHTML = `
        <div class="empty-state">
          <p>No actionable items available</p>
        </div>
      `

      await new Promise((resolve) => setTimeout(resolve, 80))

      expect(lostCalls).toBe(1)

      stop()
      await manager.destroy()
      container.remove()
    })
  })

  describe('Gap 8: React synthetic event-compatible native value and checked setters', () => {
    it('invokes prototype property descriptors and dispatches input/change events for inputs and checkboxes', async () => {
      const container = document.createElement('div')
      container.innerHTML = `
        <input id="react-input" type="text" value="" />
        <input id="react-checkbox" type="checkbox" />
      `
      document.body.appendChild(container)

      const input = document.getElementById('react-input') as HTMLInputElement
      const checkbox = document.getElementById('react-checkbox') as HTMLInputElement

      let interceptedInputValue = ''
      let inputEventFired = false
      let changeEventFired = false

      const originalInputDescriptor = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )

      Object.defineProperty(input, 'value', {
        get() {
          return originalInputDescriptor?.get?.call(this) as string
        },
        set(v: string) {
          interceptedInputValue = v
          originalInputDescriptor?.set?.call(this, v)
        },
        configurable: true,
      })

      input.addEventListener('input', () => {
        inputEventFired = true
      })
      input.addEventListener('change', () => {
        changeEventFired = true
      })

      await runBrowserActions(
        [{ type: 'textbox', target: '#react-input', value: 'Hello World' }],
        { document },
      )

      expect(interceptedInputValue).toBe('Hello World')
      expect(input.value).toBe('Hello World')
      expect(inputEventFired).toBe(true)
      expect(changeEventFired).toBe(true)

      let checkboxChangeFired = false
      checkbox.addEventListener('change', () => {
        checkboxChangeFired = true
      })

      await runBrowserActions(
        [{ type: 'checkbox', target: '#react-checkbox', value: true }],
        { document },
      )

      expect(checkbox.checked).toBe(true)
      expect(checkboxChangeFired).toBe(true)

      container.remove()
    })

    it('guards against non-input elements and throws descriptive error when textbox action targets non-input', async () => {
      const container = document.createElement('div')
      container.innerHTML = `
        <div id="fake-input">Not an input</div>
      `
      document.body.appendChild(container)

      let errorThrown: Error | null = null
      try {
        await runBrowserActions(
          [{ type: 'textbox', target: '#fake-input', value: 'Test' }],
          { document },
        )
      } catch (err: unknown) {
        errorThrown = err instanceof Error ? err : new Error(String(err))
      } finally {
        container.remove()
      }

      expect(errorThrown).not.toBeNull()
      expect(errorThrown?.message).toMatch(/HTMLInputElement|failed/i)
    })
  })

  describe('Gap 9: Special characters in element IDs and attribute keys', () => {
    it('escapes colons, quotes, and slashes in element IDs and attribute keys safely', () => {
      const html = `
        <div id="user:profile.card">Colon and Dot ID</div>
        <div id="with'single'quote">Single Quote ID</div>
        <div id="with&quot;double&quot;quote">Double Quote ID</div>
      `
      const page = new Selector(html, { adaptive: false })

      const colonEl = page.css('[id="user:profile.card"]')
      expect(colonEl.length).toBe(1)
      const cssGenerated = generateElementSelector(colonEl[0], 'css')
      expect(cssGenerated).toContain('#user\\:profile\\.card')

      const quoteEl = page.css('[id="with\'single\'quote"]')
      expect(quoteEl.length).toBe(1)
      const xpathGenerated = generateElementSelector(quoteEl[0], 'xpath')
      expect(xpathGenerated).not.toContain("'''")
      expect(xpathGenerated).toMatch(/@id/i)
    })
  })

  describe('Gap 10: Emoji codepoint length in $= CSS-to-XPath translation', () => {
    it('translates $= attribute selectors containing multi-byte Unicode emojis using codepoint length', () => {
      const html = `
        <div id="badges">
          <span id="b1" data-badge="done 🎉">Celebration</span>
          <span id="b2" data-icon="rocket-launch 🚀">Launch</span>
          <span id="b3" data-status="alert-fire 🔥">Hot Alert</span>
        </div>
      `
      const page = new Selector(html, { adaptive: false })

      const res1 = page.css('span[data-badge$="🎉"]')
      expect(res1.length).toBe(1)
      expect(res1[0].attrib.id.toString()).toBe('b1')

      const res2 = page.css('span[data-icon$="🚀"]')
      expect(res2.length).toBe(1)
      expect(res2[0].attrib.id.toString()).toBe('b2')

      const res3 = page.css('span[data-status$="🔥"]')
      expect(res3.length).toBe(1)
      expect(res3[0].attrib.id.toString()).toBe('b3')
    })
  })

  describe('Gap 11: Malformed fingerprint validation (isValidFingerprint)', () => {
    it('validates fingerprint structure thoroughly and rejects malformed objects without producing NaN scores', () => {
      expect(isValidFingerprint(null)).toBe(false)
      expect(isValidFingerprint(undefined)).toBe(false)
      expect(isValidFingerprint('string-value')).toBe(false)
      expect(isValidFingerprint(12345)).toBe(false)
      expect(isValidFingerprint([])).toBe(false)
      expect(isValidFingerprint({})).toBe(false)

      expect(
        isValidFingerprint({
          tag: '',
          attributes: {},
          path: ['div'],
        }),
      ).toBe(false)

      expect(
        isValidFingerprint({
          tag: 'div',
          attributes: 'invalid-attributes-string',
          path: ['div'],
        }),
      ).toBe(false)

      expect(
        isValidFingerprint({
          tag: 'div',
          attributes: { key: 123 },
          path: ['div'],
        }),
      ).toBe(false)

      expect(
        isValidFingerprint({
          tag: 'div',
          attributes: {},
          path: 12345,
        }),
      ).toBe(false)

      expect(
        isValidFingerprint({
          tag: 'div',
          attributes: {},
          path: [123, 456],
        }),
      ).toBe(false)

      expect(
        isValidFingerprint({
          tag: 'button',
          attributes: { id: 'btn', class: 'primary' },
          path: ['html', 'body', 'button'],
          text: 'Click Me',
          depth: 2,
        }),
      ).toBe(true)

      expect(
        isValidFingerprint({
          tag: 'a',
          attributes: { href: '/home' },
          path: 'html > body > a',
        }),
      ).toBe(true)
    })
  })

  describe('Gap 12: Bounded LRU cache eviction', () => {
    it('bounds individual bucket capacities and evicts the least recently used entries', () => {
      const storage = new MemoryStorageSystem({
        storageFile: 'gap12-test-bucket',
        capacity: 3,
        url: 'https://eviction.example.com',
      })

      const makeFp = (id: string): ElementFingerprint => ({
        tag: 'article',
        attributes: { id },
        text: `Article ${id}`,
        path: ['article'],
      })

      storage.save(makeFp('a'), 'item-a')
      storage.save(makeFp('b'), 'item-b')
      storage.save(makeFp('c'), 'item-c')

      expect(storage.retrieve('item-a')).not.toBeNull()

      storage.save(makeFp('d'), 'item-d')

      expect(storage.retrieve('item-b')).toBeNull()
      expect(storage.retrieve('item-a')).not.toBeNull()
      expect(storage.retrieve('item-c')).not.toBeNull()
      expect(storage.retrieve('item-d')).not.toBeNull()
    })
  })

  describe('Skill Hardening: Entity Bounds, Shadow Markdown, Cross-Iframe & Layout Thrash', () => {
    it('does not throw RangeError on out-of-range or surrogate numeric HTML entities in replaceEntities', () => {
      const malformed = 'Price &#999999999; &#x110000; &#xD800; &#8364; &euro;'
      const result = replaceEntities(malformed)
      expect(result).toBe('Price &#999999999; &#x110000; &#xD800; € €')
    })

    it('strips hidden root elements and projects open Shadow DOM content in htmlToMarkdown', () => {
      const hiddenRoot = document.createElement('div')
      hiddenRoot.setAttribute('style', 'display: none !important')
      hiddenRoot.innerHTML = '<p>Secret hidden prompt injection</p>'
      expect(htmlToMarkdown(hiddenRoot)).toBe('')

      const host = document.createElement('div')
      const shadow = host.attachShadow({ mode: 'open' })
      shadow.innerHTML = '<h2>Shadow Job Title</h2><p>Remote role</p><span style="opacity:0">Hidden trap</span>'
      const md = htmlToMarkdown(host)
      expect(md).toContain('## Shadow Job Title')
      expect(md).toContain('Remote role')
      expect(md).not.toContain('Hidden trap')
    })

    it('treats the hidden attribute on any tag and visibility:collapse as hidden', () => {
      const wrapper = document.createElement('div')
      wrapper.innerHTML = `
        <p>Visible copy</p>
        <div hidden><p>Attribute-hidden payload</p></div>
        <span hidden>Inline-hidden payload</span>
        <section style="visibility: collapse"><p>Collapsed payload</p></section>
        <div style="display: none"><p>Display-hidden payload</p></div>
      `

      const markdown = htmlToMarkdown(wrapper)
      expect(markdown).toContain('Visible copy')
      expect(markdown).not.toContain('Attribute-hidden payload')
      expect(markdown).not.toContain('Inline-hidden payload')
      expect(markdown).not.toContain('Collapsed payload')
      expect(markdown).not.toContain('Display-hidden payload')

      const hidden = document.createElement('div')
      hidden.setAttribute('hidden', '')
      hidden.innerHTML = '<p>Root payload</p>'
      expect(htmlToMarkdown(hidden)).toBe('')
    })

    it('handles cross-iframe elements in isElementVisible, setNativeInputValue, and setNativeCheckboxValue', () => {
      const iframe = document.createElement('iframe')
      document.body.appendChild(iframe)
      const iframeDoc = iframe.contentDocument!
      iframeDoc.open()
      iframeDoc.write('<input id="if-text" type="text" /><input id="if-chk" type="checkbox" />')
      iframeDoc.close()

      const input = iframeDoc.getElementById('if-text') as HTMLInputElement
      const chk = iframeDoc.getElementById('if-chk') as HTMLInputElement

      expect(isElementVisible(input)).toBe(true)
      setNativeInputValue(input, 'Iframe Value')
      expect(input.value).toBe('Iframe Value')

      setNativeCheckboxValue(chk, true)
      expect(chk.checked).toBe(true)

      iframe.remove()
    })

    it('avoids calling getBoundingClientRect during calculateSimilarityScore candidate evaluation', () => {
      const el = document.createElement('button')
      el.textContent = 'Apply Now'
      let rectCalls = 0
      el.getBoundingClientRect = () => {
        rectCalls++
        return new DOMRect(0, 0, 100, 30)
      }

      const origFp: ElementFingerprint = {
        tag: 'button',
        attributes: { class: 'btn' },
        text: 'Apply Now',
        path: ['html', 'body', 'button'],
      }

      const score = calculateSimilarityScore(origFp, el)
      expect(score).toBeGreaterThan(50)
      expect(rectCalls).toBe(0)
    })
  })
})
