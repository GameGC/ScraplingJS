# ScraplingJS (`scrapling-js`)

Adaptive DOM Selection, Deep Shadow DOM Piercing & Self-Healing Page Persistence for **Chrome Extensions**, **Content Scripts**, and **Browser Automation** in TypeScript.

ScraplingJS automatically fingerprints DOM elements when selectors match and relocates them when websites deploy redesigns, rotate CSS-in-JS hashes (Emotion, Styled Components, CSS Modules, Tailwind, Scoped Svelte/Vue), or refactor HTML structure.

---

## Key Features

- **Zero-Config Adaptive Queries (`scrapling`)**: Every read or action (`scrapling()`, `scrapling.all()`, `scrapling.text()`, `scrapling.attr()`, `scrapling.click()`, `scrapling.fill()`, `scrapling.check()`, `scrapling.waitFor()`) automatically saves the element fingerprint on match and restores the element via similarity scoring when the selector breaks.
- **Automatic Deep Shadow DOM Piercing**: Transparently traverses open `ShadowRoot` trees and `<slot>` projections to arbitrary depth (10+ levels) without manual snapshot calls.
- **User-Defined `save` / `read` Persistence Predicates**: Fast, bounded $O(1)$ LRU in-memory cache on the synchronous hot path, with pluggable `save`, `read`, `hydrate`, and `onError` predicates for `localStorage`, `chrome.storage.local`, `IndexedDB`, or remote R2/API storage.
- **Relocation Telemetry (`onRelocate`)**: Subscribe to adaptive recovery events with old fingerprint, new DOM element, confidence score, and broken selector details for client analytics.
- **React / Vue / Angular Compatible Actions**: Native property descriptor setters (`setNativeInputValue`, `setNativeCheckboxValue`) ensure synthetic `input` and `change` events trigger framework state updates.
- **Rich Parser & Sanitizer Engine**: Full `Selector` / `Selectors` API with CSS-to-XPath translation, pseudo-elements (`::text`, `::attr(href)`), safe template variables, `findSimilar()`, and AI-ready HTML-to-Markdown conversion.

---

## Installation

```bash
pnpm add scrapling-js
```

```bash
npm install scrapling-js
```

---

## Quick Start

```ts
import { scrapling } from 'scrapling-js'

const searchInput = scrapling<HTMLInputElement>('input[name="q"]', 'search-input')
scrapling.fill('input[name="q"]', 'Senior TypeScript Engineer', 'search-input')

const submitTaken = scrapling.click(
  ['button[type="submit"]', 'button[data-testid="search-submit"]'],
  'search-submit',
)

const titles = scrapling.texts('h2.jobTitle a', 'job-titles')
```

If the target website updates its markup and `input[name="q"]` or `h2.jobTitle a` stops matching, `scrapling` automatically relocates the element(s) using the stored fingerprint for `'search-input'` or `'job-titles'`.

---

## Custom Save & Read Persistence Predicates

On the hot path, ScraplingJS uses a bounded in-memory [`LruMap`](file:///Users/user/unityProjects/ScraplingJS/src/storage/memory.ts) (`MemoryStorageSystem`) so queries remain synchronous and never leak memory. To persist fingerprints across page reloads or browser sessions, pass your own `save`, `read`, `hydrate`, and `onError` functions via `scrapling.configure(...)` or `createScrapling(...)`.

### Example 1: `localStorage` Predicates with Quota Protection

```ts
import {
  scrapling,
  isValidFingerprint,
  type ElementFingerprint,
} from 'scrapling-js'

const STORAGE_PREFIX = 'scrapling-fp:'

scrapling.configure({
  save: (key: string, fingerprint: ElementFingerprint) => {
    const serialized = JSON.stringify(fingerprint)
    try {
      window.localStorage.setItem(`${STORAGE_PREFIX}${key}`, serialized)
    } catch {
      const oldestKey = Object.keys(window.localStorage).find((k) =>
        k.startsWith(STORAGE_PREFIX),
      )
      if (oldestKey) {
        window.localStorage.removeItem(oldestKey)
        window.localStorage.setItem(`${STORAGE_PREFIX}${key}`, serialized)
      }
    }
  },
  read: (key: string): ElementFingerprint | null => {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${key}`)
    if (!raw) return null
    try {
      const parsed: unknown = JSON.parse(raw)
      return isValidFingerprint(parsed) ? parsed : null
    } catch {
      return null
    }
  },
  hydrate: async (): Promise<Record<string, ElementFingerprint>> => {
    const out: Record<string, ElementFingerprint> = {}
    for (let i = 0; i < window.localStorage.length; i++) {
      const fullKey = window.localStorage.key(i)
      if (fullKey && fullKey.startsWith(STORAGE_PREFIX)) {
        const raw = window.localStorage.getItem(fullKey)
        if (raw) {
          try {
            const parsed: unknown = JSON.parse(raw)
            if (isValidFingerprint(parsed)) {
              out[fullKey.slice(STORAGE_PREFIX.length)] = parsed
            }
          } catch {}
        }
      }
    }
    return out
  },
  onError: (error, context) => {
    window.postMessage(
      {
        source: 'my-extension',
        type: 'storage-error',
        operation: context.operation,
        key: context.key,
        error: error instanceof Error ? error.message : String(error),
      },
      '*',
    )
  },
})
```

### Example 2: Asynchronous `chrome.storage.local` with Pre-Hydration

Because DOM queries (`scrapling()`, `page.css()`) execute synchronously, asynchronous stores like `chrome.storage.local` or IndexedDB should preload their snapshot once on startup via `hydrate()` and write back asynchronously in `save`:

```ts
import {
  createScrapling,
  isValidFingerprint,
  MemoryStorageSystem,
  type ElementFingerprint,
} from 'scrapling-js'

const STORAGE_KEY = 'scrapling_fingerprints_v1'

const storage = new MemoryStorageSystem({
  url: window.location.href,
  save: async (key: string, fingerprint: ElementFingerprint) => {
    const current = await chrome.storage.local.get(STORAGE_KEY)
    const map = (current[STORAGE_KEY] as Record<string, ElementFingerprint> | undefined) ?? {}
    map[key] = fingerprint
    await chrome.storage.local.set({ [STORAGE_KEY]: map })
  },
  hydrate: async () => {
    const current = await chrome.storage.local.get(STORAGE_KEY)
    const rawMap = (current[STORAGE_KEY] as Record<string, unknown> | undefined) ?? {}
    const valid: Record<string, ElementFingerprint> = {}
    for (const [k, v] of Object.entries(rawMap)) {
      if (isValidFingerprint(v)) {
        valid[k] = v
      }
    }
    return valid
  },
})

await storage.hydrate()

export const appScrapling = createScrapling({
  storage,
})
```

---

## Relocation Analytics (`onRelocate`)

Track when a website's selectors break in production and get the newly relocated element along with its similarity score:

```ts
import { scrapling } from 'scrapling-js'

const unsubscribe = scrapling.onRelocate((oldFingerprint, newElement, event) => {
  window.postMessage(
    {
      source: 'my-extension',
      type: 'analytics',
      message: 'selector_relocated',
      data: {
        key: event.identifier,
        brokenSelector: event.brokenSelector,
        score: event.score,
        oldTag: oldFingerprint.tag,
        newTag: newElement.tagName.toLowerCase(),
        newSelector: event.newSelector.generateFullCssSelector,
      },
    },
    '*',
  )
})
```

---

## Scoped Queries, Fallback Arrays & Filter Predicates

### Scoped Queries Inside Cards (`scrapling.in(card)`)

Use `scrapling.in(container)` to scope all queries and adaptive recovery to a specific card or modal:

```ts
import { scrapling } from 'scrapling-js'

const PRIMARY_LINK_SELECTORS = [
  'h2.jobTitle a.jcs-JobTitle[data-jk]',
  'h2.jobTitle a[data-jk]',
  'a.jcs-JobTitle[data-jk]',
  'a[data-jk]',
] as const

function isPrimaryLink(el: HTMLAnchorElement): boolean {
  if (el.closest('[data-testid="location-rollup"]')) return false
  const href = (el.getAttribute('href') ?? '').toLowerCase()
  return !href.includes('addlloc')
}

const cards = scrapling.all<HTMLElement>(
  '.job_seen_beacon',
  (el) => !el.closest('.recommendation-section'),
  'job-cards',
)

for (const card of cards) {
  const inCard = scrapling.in(card)

  const link = inCard<HTMLAnchorElement>(
    PRIMARY_LINK_SELECTORS,
    isPrimaryLink,
    'primary-job-link',
  )

  const title = inCard.text(
    ['h2.jobTitle span[title]', 'h2.jobTitle'],
    'card-job-title',
  )

  const company = inCard.text(
    ['[data-testid="company-name"]', '.companyName'],
    'card-company-name',
  )

  const jobKey = inCard.attr(PRIMARY_LINK_SELECTORS, 'data-jk', 'card-job-key')

  if (link && title && company && jobKey) {
    link.click()
  }
}
```

### Waiting for Dynamic Elements & Conditions

```ts
import { scrapling } from 'scrapling-js'

const footer = await scrapling.waitFor('footer', {
  timeout: 10_000,
  visible: true,
  identifier: 'page-footer',
})

const descriptionLoaded = await scrapling.waitUntil(
  () => {
    const text = scrapling.text('#jobDescriptionText', 'job-description')
    return text.length > 40 ? text : null
  },
  8_000,
  200,
)

const rawDescriptionEl = scrapling('#jobDescriptionText', 'job-description')
const cleanMarkdown = scrapling.markdown(rawDescriptionEl)
```

---

## Real-World Mutation Watcher (`scrapling.watch`)

Automatically re-resolve an element whenever SPA route transitions or DOM mutations replace it:

```ts
import { scrapling } from 'scrapling-js'

const stopWatching = scrapling.watch({
  key: 'apply-cta',
  selector: 'button[data-testid="apply-button"]',
  percentage: 50,
  autoSave: true,
  onResolved: (element, relocated, score) => {
    element.setAttribute('data-extension-bound', 'true')
    if (relocated) {
      element.setAttribute('data-relocated-score', String(score ?? 0))
    }
  },
  onLost: () => {
    window.dispatchEvent(new CustomEvent('apply-button-missing'))
  },
})
```

---

## Low-Level `Selector` & `Selectors` API

When working directly with HTML strings, subtrees, or custom `StorageSystem` instances, use `Selector`:

```ts
import { Selector, MemoryStorageSystem } from 'scrapling-js'

const storage = new MemoryStorageSystem({ url: 'https://example.com' })

const page = new Selector(document.documentElement, {
  url: 'https://example.com',
  adaptive: true,
  pierceShadow: true,
  storage,
})

const priceText = page
  .css('.product-card .price::text', {
    identifier: 'product-price',
    autoSave: true,
  })
  .get()

const itemBySku = page.css('[data-sku="$sku"]', {
  variables: { sku: 'SKU-9001' },
})

const xpathItem = page.xpath('//a[contains(@title, $title)]', {
  variables: { title: 'Senior Engineer' },
})

const firstCard = page.css('.product-card').first
const siblingCards = firstCard ? firstCard.findSimilar({ ignoreAttributes: ['id', 'href'] }) : []

const extractedNumbers = page.css('.salary-badge').re(/\$(\d+k?)/i)
```

---

## Declarative Browser Actions (`runBrowserActions`)

Execute a validated sequence of browser interactions (`click`, `fill`, `check`, `select`, `press`, `scroll`, `wait_for`, `wait_load`, `evaluate`) against any `Document`:

```ts
import { runBrowserActions } from 'scrapling-js'

await runBrowserActions(document, [
  { type: 'wait_load', state: 'interactive', timeout: 5_000 },
  { type: 'fill', selector: 'input[name="q"]', value: 'Remote Rust', clear: true },
  { type: 'check', selector: 'input[name="remote"]', checked: true },
  { type: 'click', selector: 'button[type="submit"]' },
  { type: 'wait_for', selector: '.results-list', state: 'visible', timeout: 8_000 },
])
```

---

## API Summary

### `scrapling` / `createScrapling(options)`

| Method | Description |
|---|---|
| `scrapling(query, rootOrFilterOrKey?, filterOrKey?, key?)` | Find first matching `HTMLElement` (auto-remembers on match, auto-restores on miss). |
| `scrapling.all(query, rootOrFilterOrKey?, filterOrKey?, key?)` | Find all matching `HTMLElement[]` with adaptive sibling recovery. |
| `scrapling.in(root)` | Create a `ScopedScrapling` bound to a specific container element. |
| `scrapling.text(query, ...)` / `scrapling.texts(query, ...)` | Extract trimmed text or array of texts with adaptive fallback. |
| `scrapling.attr(query, attrName, ...)` | Read attribute value from matched or relocated element. |
| `scrapling.click(query, ...)` | Click matched or relocated element. |
| `scrapling.fill(query, value, ...)` | Fill `<input>`, `<textarea>`, or `[contenteditable]` using React-compatible native setter. |
| `scrapling.check(query, checked?, ...)` | Toggle checkbox/radio state using React-compatible native setter. |
| `scrapling.waitFor(query, optionsOrTimeout?)` | Poll via `MutationObserver` + interval until element exists (and optionally is visible). |
| `scrapling.waitUntil(condition, timeoutMs?, pollMs?)` | Poll custom predicate until truthy value is returned. |
| `scrapling.isVisible(element)` | Check layout bounding box, `display`, `visibility`, and `opacity`. |
| `scrapling.markdown(htmlOrElement)` | Convert DOM element or HTML string into clean, sanitized Markdown. |
| `scrapling.onRelocate(callback)` | Register listener `(oldFp, newEl, event) => void` triggered on adaptive recovery. |
| `scrapling.watch(options)` | Continuously observe DOM & Shadow DOM mutations and re-resolve target element. |
| `scrapling.configure(options)` | Update manager options (`save`, `read`, `hydrate`, `onError`, `percentage`, `storageCapacity`). |

---

## Development & Benchmarks

```bash
npx tsc --noEmit
pnpm build
pnpm test
pnpm bench
```

### Benchmark Resilience Matrix (`pnpm bench` & `hard-bench`)

- **Framework Migration Suite (`test-bench/cli.ts`)**: **36 / 36 (100.0%)** adaptive element recovery across React 18 (Emotion), Next.js 14 (CSS Modules), Vue 3 (Tailwind CSS), Svelte 5 (Scoped CSS), and Node.js (SSR + BEM) where 100% of traditional CSS selectors fail.
- **Hard Migration Matrix (`test-bench/test/hard-bench.test.ts`)**:
  - `structural` (wrapper depth & grid/flex reorganization): **9 / 9 (100%)**
  - `text-drift` (copy tweaks, symbol changes, salary format `$140,000` → `$140k`): **9 / 9 (100%)**
  - `semantic` (`<button>` → `<div role="button">`, `<a>` → `<div role="link">`): **9 / 9 (100%)**
  - `negative` (removed elements + decoy controls): **0 false positives (100% precision)**

---

## License

BSD-3-Clause
