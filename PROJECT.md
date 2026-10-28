# Project: scrapling-js Refactoring

## Architecture
- **Bounded In-Memory Cache on Hot Path**: `src/storage/memory.ts` provides an O(1) `LruMap` storage engine bounding both file buckets (`globalBuckets` ≤ 100) and entry counts (default 1000). All synchronous queries (`scrapling()`, `css()`, `xpath()`) resolve synchronously from this cache.
- **Custom Persistence Predicates & Merge-Only Hydration**: Persistence is delegated to optional user-defined `save(key, fingerprint)` and `read(key)` predicates. Asynchronous storage is preloaded via `hydrate()`, which follows merge-only semantics (newer in-memory entries are never overwritten). Unhydrated Promise returns during synchronous retrieval trigger an explicit runtime guard error.
- **Legacy Storage Deprecation**: `src/storage/local-storage.ts`, `src/storage/indexeddb.ts`, `src/storage/chrome-storage.ts`, and `src/storage/auto-storage.ts` are removed entirely. `MemoryStorageSystem` becomes the default storage engine throughout.
- **Runtime Boundary (`DomAdapter`)**: HTML parsing, XPath evaluation, mutation observation and node-kind checks go through an injectable `DomAdapter` (`src/core/dom-adapter.ts`). The browser adapter is the default; `setDomAdapter()`/`getDomAdapter()` and a per-instance `dom` option support Node (linkedom + xpath reference adapter) and Puppeteer workflows. Missing capabilities raise `DomAdapterError` with the exact configuration hint instead of a `ReferenceError`. `await Selector.fromHandle(handle)` snapshots a Puppeteer/Playwright `ElementHandle`; a synchronous `new Selector(handle)` raises `ElementHandleError` pointing at it.
- **Actions, Snapshot & Query Engine**: Robust browser action execution (`wait_load` supporting readyState and `doc.defaultView`, `timeout: 0` evaluating immediately, `AbortSignal` cancellation, unified React-compatible native input/checkbox setters with `instanceof` guards), regex flag stripping in snapshot search, Safari < 16.4 regex compatibility, and safe XPath/CSS variable substitution without token expansion corruption.
- **Strict TypeScript & Zero Comments**: Discriminated union for `InternalNodeWrapper`, elimination of all `as any` casts and non-null assertions, strict compiler options (`noImplicitOverride`, `noFallthroughCasesInSwitch`, `noUnusedLocals`), and zero comments across all `.ts` files in the repository.
- **Verification & Multi-Agent Review**: Comprehensive 4-tier test suite, 36/36 benchmark resilience, and 4-perspective independent code review verifying 0 BLOCKER, 0 CRITICAL, and 0 MAJOR issues.
- **Shadow Scope Honored by Relocation**: `pierceShadow` is threaded through `scoreCandidates`, `relocateHighestScoring`, `relocateBest` and `relocateAll`, and `PagePersistenceManagerOptions.pierceShadow` feeds both its root selectors and its relocation calls. A scope that refuses `ShadowRoot` content can no longer recover a shadow element through the adaptive fallback.
- **Query Execution Path**: `css()` resolves one shared shadow-context scan per call (`collectQueryContextRoots`, reused by every comma-group part) and executes through native `querySelectorAll` when the scope has no shadow context roots. `tryNativeCssQuery` returns `null` whenever the native engine rejects the selector, so the CSS-to-XPath translator stays both the fallback and the definition of valid syntax.
- **difflib-Faithful Sequence Matching**: `SequenceMatcher` ports difflib's autojunk cutoff (`b.length >= 200`, popular elements are dropped from `b2j`), keeps the extension phase over non-junk elements, and replaces per-character `Map` rows with pooled typed-array scratch. Verified against Python `difflib` on 200 randomized pairs (exact ratio parity); `prepareFingerprint` prepares a fingerprint once per relocation scan and scoring skips never-target tags.
- **Debounced Waits**: `waitUntilCondition` debounces mutation batches (`PagePersistenceManager` passes its `debounceMs`), polls at >= 200 ms and `wait_element` reuses a single target `Selector` across checks.
- **CI & Dev-Server Hardening**: all 17 GitHub Actions `uses:` refs are pinned to commit SHAs, `pnpm typecheck:test` (`tsconfig.test.json`) type-checks `test/node`, and the bench `/dynamic` route validates `seed` against `^[A-Za-z0-9_-]{1,32}$` and allowlists `framework`.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Bounded In-Memory LRU Cache | O(1) LRU eviction in `memory.ts` bounding file buckets (100) and entries (1000) (M-10) | M2 | Survey 1 |
| 2 | Custom Save/Read Predicates | User-defined sync/async `save(key, fp)` and `read(key)` predicates in `MemoryStorageSystem` | M2 | Survey 1 |
| 3 | Sync Hot-Path Guard (B-1/B-2) | Honest sync contract throwing descriptive error if `read()` returns unhydrated Promise | M2 | Survey 1 |
| 4 | Merge-Only Hydration (C-3) | `hydrate()` with merge-only semantics and optional `onError` error reporting callback | M2 | Survey 1 |
| 5 | Legacy Storage Elimination | Removal of `local-storage.ts`, `indexeddb.ts`, `chrome-storage.ts`, `auto-storage.ts` | M2 | Survey 1 |
| 6 | Fingerprint Validation (M-8) | `isValidFingerprint` type guard rejecting malformed data before similarity scoring | M2 | Survey 1 |
| 7 | Action wait_load Fix (C-1) | Respect `state`, attach listeners to `doc.defaultView`, enforce `Promise.race` timeout | M3 | Survey 2 |
| 8 | Action timeout: 0 & Abort (C-2) | Single immediate check for `timeout: 0`, and `AbortSignal` cancellation support | M3 | Survey 2 |
| 9 | Native Form Setters (C-6) | Unified React-compatible `setNativeInputValue`/`setNativeCheckboxValue` with `instanceof` | M3 | Survey 2 |
| 10 | Snapshot Regex Flag Fix (C-5) | Strip stateful `g`/`y` flags or reset `lastIndex` in line-by-line `searchSnapshot` | M3 | Survey 2 |
| 11 | Safari Regex Compatibility (M-11) | Replace `(?<![\w-])` lookbehind in `sanitizer.ts` with Safari < 16.4 compatible pattern | M3 | Survey 2 |
| 12 | XPath Variable Replacer (C-4) | Escape var names via `escapeRegExpChars` and use `() => replacement` callback | M4 | Survey 2 |
| 13 | CSS Variables Interpolation (M-3) | Support `variables?: Record<string, string \| number>` in `css()` matching `xpath()` | M4 | Survey 2 |
| 14 | Attribute Key Escaping (M-2) | Validate and escape attribute keys in `findAll` | M4 | Survey 2 |
| 15 | ID Escaping in Mixins (M-1) | Escape element IDs via `CSS.escape` / `xpathLiteral` and escape `\` in `escapeCssString` | M4 | Survey 2 |
| 16 | Codepoint Length for $= (M-6) | Use `Array.from(val).length` for `$=` to XPath `substring()` | M4 | Survey 2 |
| 17 | Shadow Observer Debounce (M-7) | Debounce `syncShadowObservers` and tag pre-filter in `relocateWithScore` | M4 | Survey 2 |
| 18 | waitUntil Error Propagation (M-9) | Do not swallow unexpected exceptions thrown inside user `condition()` callbacks | M4 | Survey 2 |
| 19 | Domain Neutrality | Remove hardcoded `'data-jk'` from default `ignoreAttributes` | M4 | Survey 2 |
| 20 | Discriminated Union Wrapper | Refactor `InternalNodeWrapper` into `{ kind: 'element' } \| { kind: 'text' }` | M5 | Survey 3 |
| 21 | Eliminate Non-Null Assertions | Eliminate 16 `this._wrapper.element!` non-null assertions via type narrowing | M5 | Survey 3 |
| 22 | Eliminate `as any` Casts | Replace all 13 `as any` casts with strict types | M5 | Survey 3 |
| 23 | Eliminate Index Signatures | Remove `[key: string]: any` from `Selector` and `AdaptiveQueryOptions` | M5 | Survey 3 |
| 24 | Helper Deduplication | Unify `parseQueryArguments`, `isElementVisible`, and form setters in `src/core/utils.ts` | M5 | Survey 3 |
| 25 | Action Exhaustiveness | Add `never`-guard default exhaustiveness to `runBrowserActions` and `validateActions` | M5 | Survey 3 |
| 26 | Strict tsconfig Flags | Enable `noImplicitOverride`, `noFallthroughCasesInSwitch`, `noUnusedLocals` | M5 | Survey 3 |
| 27 | Zero-Comment Enforcement | Enforce 0 comments (`//` or `/* ... */`) across all `.ts` files | M5 | Survey 3 |
| 28 | Comprehensive Test Suite (R4) | Test custom predicates, `localStorage` example, and all 12 code review test-gaps | M1 | Survey 3 |
| 29 | Benchmark & Repeat Review (R4) | 36/36 benchmark recovery + repeat independent 4-agent review (0 B, 0 C, 0 M) | M6 | Survey 3 |
| 30 | DomAdapter Runtime Boundary | Injectable `parseHtml`/`evaluateXPath`/`createObserver` + `setDomAdapter` registry, browser default, actionable `DomAdapterError` messages | M7 | Survey 4 |
| 31 | Node & Puppeteer Support | `Selector.fromHandle`, structural node checks instead of `instanceof Element`, 12 Node-runtime tests, `pnpm test:node` CI gate | M7 | Survey 4 |
| 32 | pierceShadow Relocation Contract | Thread `pierceShadow` through `scoreCandidates`/relocate helpers and `PagePersistenceManagerOptions` | M8 | Survey 5 |
| 33 | Query Mode Parity | Manager queries with pseudo-CSS (`::text`, `:contains`, bare `$var`) resolve to CSS instead of silently searching for their literal text | M8 | Survey 5 |
| 34 | Node Test Typecheck Gate | `tsconfig.test.json` + `pnpm typecheck:test` covering `test/node`, wired into the Code Quality workflow | M8 | Survey 5 |
| 35 | Pinned GitHub Actions | All 17 `uses:` refs pinned to resolved commit SHAs with a trailing tag comment | M8 | Survey 5 |
| 36 | Bench Route Param Validation | `/dynamic` rejects non-allowlisted `framework` and seed values outside `^[A-Za-z0-9_-]{1,32}$` (previously reflected into attributes) | M8 | Survey 5 |
| 37 | difflib Autojunk Parity | Ported the autojunk cutoff; exact `difflib` ratio parity on 200 randomized pairs (was 88 divergences) while removing the quadratic blowup on long inputs | M8 | Survey 5 |
| 38 | Relocation Scoring Perf | `prepareFingerprint` per scan, pooled typed-array matcher scratch, never-target tag prefilter (long-text scoring ~180x faster in the bench corpus) | M8 | Survey 5 |
| 39 | Query Fast Path & Shared Shadow Scan | One shadow-context scan per `css()` call, native `querySelectorAll` when no shadow roots exist (comma groups x5.6, class queries x4.6 in the bench corpus) | M8 | Survey 5 |
| 40 | Debounced Waits | Observer batches debounce into one evaluation, `wait_element` polls at 200 ms and reuses the target `Selector` | M8 | Survey 5 |
| 41 | Single-Pass Selector Variables | CSS/XPath `$var` substitution runs one combined pass with prototype lookup, so a value containing another variable name is no longer expanded (CWE-643) | M9 | Audit 2026-10-27 |
| 42 | Bench Page Containment | `/pages/:filename` resolves against the pages directory, rejects `..`, absolute paths and null bytes, and 404s anything outside it | M9 | Audit 2026-10-27 |
| 43 | Hidden-Content Sanitizer | `hidden` is honored on every tag and `visibility:collapse` joins the hiding declarations, closing the hidden-attribute bypass in AI snapshots | M9 | Audit 2026-10-27 |
| 44 | Matcher Pool Safety | Pooled matching rows are cleared in `finally` and a re-entrant call gets local buffers, so an exception can no longer leak counters into the next ratio | M9 | Audit 2026-10-27 |
| 45 | Semantic Tag-Change Gate | Pass 2 runs whenever the best same-tag candidate is below 60%, preventing an unrelated old-tag element from masking a renamed target | M9 | Audit 2026-10-27 |
| 46 | Storage Domain Keys & Capacity | `localhost`/IP ports and extension ids keep distinct keys, differing `capacity` gets a private bucket, and `clear()` is scoped to the current domain | M9 | Audit 2026-10-27 |
| 47 | ignoreAttributes in Scoring | The manager's attribute exclusions reach `relocateBest`, `relocateAll` and `calculateSimilarityScore`, including dictionary diff, per-attribute bonuses and semantic tokens | M9 | Audit 2026-10-27 |
| 48 | XPath Subtree Scope & Variables | Element-rooted `//` expressions (every union branch) are scoped to the subtree; the positional `variables` argument merges with object options instead of being dropped | M9 | Audit 2026-10-27 |
| 49 | Pretty Print, Markdown & Reconfigure | `prettify()` escapes text/attributes and emits void tags correctly; markdown keeps images and table cells; `configure()` keeps `onRelocate` subscribers and attaches a rejection handler to the destroyed manager | M9 | Audit 2026-10-27 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | E2E & Unit Test Suite Creation | Tests for custom predicates, `localStorage` example, and 12 review test-gaps | none | DONE |
| M2 | Storage Engine & Custom Predicates | LRU `memory.ts`, user predicates, merge `hydrate()`, remove legacy files | none | DONE |
| M3 | Actions, Snapshot & DOM Utilities | `wait_load`, `timeout: 0`, `AbortSignal`, native setters, regex flags, Safari regex | none | DONE |
| M4 | Selector, Parser, Translator & Persistence | XPath/CSS variables, ID/attr escaping, codepoint length, debounced shadow observers | M3 | DONE |
| M5 | Type-Debt Elimination & Strict Hygiene | Discriminated union wrapper, zero `as any`, no index signatures, strict tsconfig, zero comments | M2, M3, M4 | DONE |
| M6 | Verification, Hard Bench & Repeat Review | 100% test pass, 36/36 benchmark recovery, repeat independent 4-agent code review | M1, M5 | DONE |
| M7 | Runtime Portability (Node & Puppeteer) | `DomAdapter`, adapter-driven parsing/XPath/observation, `Selector.fromHandle`, node test config + CI gate | M5 | DONE |
| M8 | Review Remediation (P0/P1) | Shadow-scope relocation fix, query mode parity, node-test typecheck gate, pinned actions, bench param validation, difflib parity + scoring/query/wait perf | M5, M7 | DONE |
| M9 | Wildcard Audit Hardening | Variable injection, bench containment, sanitizer bypass, matcher pool, semantic tag gate, storage domain/capacity, ignoreAttributes, XPath scope, pretty/markdown/reconfigure | M8 | DONE |

## Interface Contracts

### Storage Engine Contract (`src/storage/base.ts` & `src/storage/memory.ts`)
```ts
export type SavePredicate = (key: string, fingerprint: ElementFingerprint) => void | Promise<void>
export type ReadPredicate = (key: string) => ElementFingerprint | null | Promise<ElementFingerprint | null>
export type ErrorHandler = (
  error: unknown,
  context: { operation: 'save' | 'read' | 'hydrate' | 'close'; key?: string },
) => void

export interface MemoryStorageOptions {
  storage_file?: string
  storageFile?: string
  url?: string | null
  capacity?: number
  save?: SavePredicate
  read?: ReadPredicate
  hydrate?: () => Promise<Record<string, ElementFingerprint> | Iterable<[string, ElementFingerprint]>>
  onError?: ErrorHandler
}

export interface StorageSystem {
  readonly url?: string | null
  save(element: Element | ElementFingerprint, identifier: string): void | Promise<void>
  retrieve(identifier: string): ElementFingerprint | null | Promise<ElementFingerprint | null>
  hydrate?(): void | Promise<void>
  flush?(): void | Promise<void>
  close?(): void | Promise<void>
}
```

Memory buckets are shared by `storageFile` only when the requested `capacity` matches; a differing capacity gets a private bounded bucket. `clear()` deletes only keys under the instance's base-domain prefix, while the static `clearAll()` resets the whole registry. `extractBaseDomain` keeps `localhost`/IP ports and `chrome-extension://` ids as distinct keys instead of reducing them to `default` or `0.1`.

### Fingerprint Type Guard Contract (`src/storage/base.ts`)
```ts
export function isValidFingerprint(fp: unknown): fp is ElementFingerprint {
  if (typeof fp !== 'object' || fp === null || Array.isArray(fp)) return false
  const candidate = fp as Record<string, unknown>
  if (typeof candidate.tag !== 'string' || candidate.tag.trim() === '') return false
  if (typeof candidate.attributes !== 'object' || candidate.attributes === null) return false
  const path = candidate.path
  const validPath =
    (typeof path === 'string' && path.trim().length > 0) ||
    (Array.isArray(path) && path.length > 0 && path.every((part) => typeof part === 'string'))
  return validPath
}
```

### Action Dispatcher & Native Setters (`src/core/dom-utils.ts` & `src/actions/browser-actions.ts`)
```ts
export function setNativeInputValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void
export function setNativeCheckboxValue(el: HTMLInputElement, checked: boolean): void
export function isElementVisible(el: Element | null | undefined): boolean
export function isInputElement(el: unknown): el is HTMLInputElement
export function isTextAreaElement(el: unknown): el is HTMLTextAreaElement
export function isSelectElement(el: unknown): el is HTMLSelectElement
```

### Query Overload Parser (`src/persistence/query-parser.ts`)
```ts
export function parseQueryArguments<T extends HTMLElement = HTMLElement>(
  selectorOrSelectors: string | readonly string[],
  arg1?: Element | Document | ElementFilter<T> | string,
  arg2?: ElementFilter<T> | string,
  arg3?: string,
): { root?: Element | Document; filter?: ElementFilter<T>; identifier: string }
```

### InternalNodeWrapper Discriminated Union (`src/parser/html-loader.ts`)
```ts
export type InternalNodeWrapper =
  | { kind: 'element'; element: Element }
  | { kind: 'text'; textValue: string; parentElement?: Element | null }
```

### DomAdapter Contract (`src/core/dom-adapter.ts`)
```ts
export interface DomAdapter {
  parseHtml(html: string, mimeType?: DomMimeType): Document
  evaluateXPath(
    expression: string,
    contextNode: Node,
    namespaces?: Record<string, string> | null,
  ): XPathNodeSnapshot
  isElement(node: unknown): node is Element
  isDocument(node: unknown): node is Document
  isDocumentFragment(node: unknown): node is DocumentFragment
  isShadowRoot(node: unknown): node is ShadowRoot
  createObserver?(callback: (records: MutationRecord[]) => void): MutationObserverLike
}

export function setDomAdapter(adapter: DomAdapter | null): void
export function getDomAdapter(): DomAdapter
export function resolveDomAdapter(adapter?: DomAdapter | null): DomAdapter
export const browserDomAdapter: DomAdapter
```

`SelectorOptions.dom` and `PagePersistenceManagerOptions.dom` accept a per-instance adapter. `Selector.fromHandle(handle, options?)` reads `handle.asElement().evaluate(el => el.outerHTML)` and builds an offline `Selector`.

### Selector & Query Options Contract (`src/types.ts`)
```ts
export interface AdaptiveQueryOptions {
  identifier?: string
  adaptive?: boolean
  autoSave?: boolean
  auto_save?: boolean
  percentage?: number
  variables?: Record<string, string | number>
}
```

### Scoring, Query Path & Waiter Contract
```ts
export interface PreparedFingerprint {
  tokens: Set<string>
  text: string
  words: string[]
  cleanWords: string
  hasActive: boolean
}

export function prepareFingerprint(
  original: ElementFingerprint,
  ignoreAttributes?: readonly string[],
): PreparedFingerprint
export function calculateSimilarityScore(
  original: ElementFingerprint,
  candidate: Element | ElementFingerprint,
  prepared?: PreparedFingerprint,
  ignoreAttributes?: readonly string[],
): number

export function collectQueryContextRoots(root: Element, pierceShadow: boolean): Element[]
export function tryNativeCssQuery(
  root: Element,
  cssSelector: string,
  contextRoots: readonly Element[],
): Element[] | null
export function runXPathQuery(
  root: Element,
  resolvedXpath: string,
  pierceShadow: boolean,
  originalSelector: string,
  adapter: DomAdapter,
  contextRoots?: readonly Element[],
): Array<Element | InternalNodeWrapper>
export function waitUntilCondition<R>(
  doc: Document,
  condition: () => R | null | undefined | false,
  timeoutMs?: number,
  pollMs?: number,
  signal?: AbortSignal,
  adapter?: DomAdapter | null,
  debounceMs?: number,
): WaitUntilHandle<R>
```

`PagePersistenceManagerOptions.pierceShadow` (default `true`) is applied to the manager's root selectors and to `relocateWithScore`/`relocateAllWithScore`, so queries and the adaptive fallback share one scope. `PagePersistenceManagerOptions.ignoreAttributes` (default `['href', 'src', 'id']`) is likewise threaded into single and bulk relocation scoring, including the attribute dictionary diff, per-attribute bonuses and semantic-token extraction.

`runXPathQuery` scopes `//` expressions to the selector's element root, splitting top-level `|` unions so every absolute branch becomes `.//...`; document-root selectors keep absolute paths unchanged. `interpolateCssSelector`/`interpolateXPathSelector` perform a single combined replacement pass and never re-scan inserted literals.

## Code Layout
- `src/storage/`:
  - `base.ts`: Base storage types, `StorageSystem` interface, `isValidFingerprint` guard
  - `memory.ts`: `LruMap`, `MemoryStorageSystem`, user predicates, merge-only `hydrate()`, B-1/B-2 sync guard
  - `index.ts`: Re-export `base.ts` and `memory.ts` only (legacy files deleted)
- `src/actions/`:
  - `browser-actions.ts`: `runBrowserActions`, `validateActions`, `waitForDocumentLoad`, realm-safe form actions
- `src/snapshot/`:
  - `search.ts`: `searchSnapshot` with stripped `g`/`y` flags
  - `sanitizer.ts`: `sanitizeSnapshotHtml` with Safari < 16.4 compatible regex
  - `shadow-dom.ts`: `captureShadowSnapshot` plus core traversal re-exports
- `src/parser/`:
  - `html-loader.ts`: HTML parsing, root normalization, pretty printing
  - `dom-traversal.ts`: text collection, child and ancestor traversal
  - `query-runner.ts`: CSS/XPath option normalization, variable interpolation, shared shadow-context roots, native CSS fast path, XPath execution
  - `element-finder.ts`: findAll argument parsing, similarity, text and regex search
  - `element-handle.ts`: Puppeteer/Playwright handle detection, `outerHTML` snapshot, actionable handle errors
  - `selector.ts`: thin `Selector` facade and Python-compatible aliases
  - `selectors.ts`: `Selectors` collection methods
- `src/core/`:
  - `dom-adapter.ts`: `DomAdapter` contract, browser adapter, registry, observer helpers, `DomAdapterError`/`ElementHandleError` re-exports
  - `text-utils.ts`, `dom-utils.ts` (incl. structural `isElementNode`), `shadow-dom.ts` (incl. `collectQueryContextRoots`), `sequence-matcher.ts` (difflib-faithful `SequenceMatcher`), `errors.ts`: dependency-free primitives
  - `text-handler.ts`, `attributes-handler.ts`, `similarity.ts`, `storage-tools.ts`, `translator.ts`, `mixins.ts`: selector building blocks
  - `relocator.ts`: shared two-pass tag-first relocation engine (honors `pierceShadow`, prepares the fingerprint once, skips never-target tags)
  - `utils.ts`, `custom-types.ts`: compatibility re-exports
- `src/persistence/`:
  - `query-parser.ts`: query mode detection, overload parsing, query option types
  - `relocator.ts`: persistence-facing re-export of the shared core relocation engine
  - `dom-watcher.ts`: deep Shadow DOM `MutationObserver` lifecycle
  - `dom-waiter.ts`: shared mutation plus interval waiter with cancellation and mutation debounce
  - `page-persistence.ts`: `PagePersistenceManager` coordinator
  - `easy.ts`: ergonomic scrapling facade
  - `scoped.ts`: `ScopedScrapling` interface and scoped factory
- `test/`:
  - `parser.test.ts`: XPath `$&` variable escaping, `css()` with `variables`, attribute key escaping, emoji `$=`
  - `persistence.test.ts`: debounced shadow observers, tag pre-filtering, `waitUntil` error propagation
  - `adaptive.test.ts`: relocation and adaptive storage behavior
  - `pierce-shadow.test.ts`: `pierceShadow` honored by relocation and by `PagePersistenceManager`
  - `query-paths.test.ts`: native CSS fast path and XPath fallback return identical matches; scope-root inclusion
  - `predicates.test.ts`: custom save/read predicates and LRU eviction
  - `review-gaps.test.ts`: native setters, cross-iframe guards, entity bounds, snapshot helpers
  - `m2-stress.test.ts`: 50,000-operation LRU oracle comparison
  - `adversarial-m2.test.ts`, `index.test.ts`: adversarial regressions and public exports
- `test/node/`:
  - `dom-adapter.test.ts`: Node queries, relocation, `waitFor` polling, `watch()` observer contract, actionable adapter errors
  - `element-handle.test.ts`: `Selector.fromHandle` snapshotting and handle rejection paths
  - `support/linkedom-adapter.ts`: reference `DomAdapter` built on `linkedom` + `xpath`
  - Run with `pnpm test:node` (`vitest.node.config.ts`, `environment: 'node'`); type-checked by `pnpm typecheck:test` (`tsconfig.test.json`)
- `test-bench/`:
  - `test/request-params.test.ts`: `/dynamic` seed/framework validation
  - `lib/request-params.ts`: seed pattern plus framework allowlist shared with the bench server
