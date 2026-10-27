# Project: scrapling-js Refactoring

## Architecture
- **Bounded In-Memory Cache on Hot Path**: `src/storage/memory.ts` provides an O(1) `LruMap` storage engine bounding both file buckets (`globalBuckets` ≤ 100) and entry counts (default 1000). All synchronous queries (`scrapling()`, `css()`, `xpath()`) resolve synchronously from this cache.
- **Custom Persistence Predicates & Merge-Only Hydration**: Persistence is delegated to optional user-defined `save(key, fingerprint)` and `read(key)` predicates. Asynchronous storage is preloaded via `hydrate()`, which follows merge-only semantics (newer in-memory entries are never overwritten). Unhydrated Promise returns during synchronous retrieval trigger an explicit runtime guard error.
- **Legacy Storage Deprecation**: `src/storage/local-storage.ts`, `src/storage/indexeddb.ts`, `src/storage/chrome-storage.ts`, and `src/storage/auto-storage.ts` are removed entirely. `MemoryStorageSystem` becomes the default storage engine throughout.
- **Runtime Boundary (`DomAdapter`)**: HTML parsing, XPath evaluation, mutation observation and node-kind checks go through an injectable `DomAdapter` (`src/core/dom-adapter.ts`). The browser adapter is the default; `setDomAdapter()`/`getDomAdapter()` and a per-instance `dom` option support Node (linkedom + xpath reference adapter) and Puppeteer workflows. Missing capabilities raise `DomAdapterError` with the exact configuration hint instead of a `ReferenceError`. `await Selector.fromHandle(handle)` snapshots a Puppeteer/Playwright `ElementHandle`; a synchronous `new Selector(handle)` raises `ElementHandleError` pointing at it.
- **Actions, Snapshot & Query Engine**: Robust browser action execution (`wait_load` supporting readyState and `doc.defaultView`, `timeout: 0` evaluating immediately, `AbortSignal` cancellation, unified React-compatible native input/checkbox setters with `instanceof` guards), regex flag stripping in snapshot search, Safari < 16.4 regex compatibility, and safe XPath/CSS variable substitution without token expansion corruption.
- **Strict TypeScript & Zero Comments**: Discriminated union for `InternalNodeWrapper`, elimination of all `as any` casts and non-null assertions, strict compiler options (`noImplicitOverride`, `noFallthroughCasesInSwitch`, `noUnusedLocals`), and zero comments across all `.ts` files in the repository.
- **Verification & Multi-Agent Review**: Comprehensive 4-tier test suite, 36/36 benchmark resilience, and 4-perspective independent code review verifying 0 BLOCKER, 0 CRITICAL, and 0 MAJOR issues.

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

## Interface Contracts

### Storage Engine Contract (`src/storage/base.ts` & `src/storage/memory.ts`)
```ts
export type SavePredicate = (key: string, fingerprint: ElementFingerprint) => void | Promise<void>
export type ReadPredicate = (key: string) => ElementFingerprint | null | Promise<ElementFingerprint | null>
export type ErrorHandler = (error: unknown, context: { operation: 'save' | 'read' | 'hydrate'; key?: string }) => void

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
  - `query-runner.ts`: CSS/XPath option normalization, variable interpolation, XPath execution
  - `element-finder.ts`: findAll argument parsing, similarity, text and regex search
  - `element-handle.ts`: Puppeteer/Playwright handle detection, `outerHTML` snapshot, actionable handle errors
  - `selector.ts`: thin `Selector` facade and Python-compatible aliases
  - `selectors.ts`: `Selectors` collection methods
- `src/core/`:
  - `dom-adapter.ts`: `DomAdapter` contract, browser adapter, registry, observer helpers, `DomAdapterError`/`ElementHandleError` re-exports
  - `text-utils.ts`, `dom-utils.ts` (incl. structural `isElementNode`), `shadow-dom.ts`, `sequence-matcher.ts`, `errors.ts`: dependency-free primitives
  - `text-handler.ts`, `attributes-handler.ts`, `similarity.ts`, `storage-tools.ts`, `translator.ts`, `mixins.ts`: selector building blocks
  - `relocator.ts`: shared two-pass tag-first relocation engine used by `Selector` and `PagePersistenceManager`
  - `utils.ts`, `custom-types.ts`: compatibility re-exports
- `src/persistence/`:
  - `query-parser.ts`: query mode detection, overload parsing, query option types
  - `relocator.ts`: persistence-facing re-export of the shared core relocation engine
  - `dom-watcher.ts`: deep Shadow DOM `MutationObserver` lifecycle
  - `dom-waiter.ts`: shared mutation plus interval waiter with cancellation
  - `page-persistence.ts`: `PagePersistenceManager` coordinator
  - `easy.ts`: ergonomic scrapling facade
  - `scoped.ts`: `ScopedScrapling` interface and scoped factory
- `test/`:
  - `parser.test.ts`: XPath `$&` variable escaping, `css()` with `variables`, attribute key escaping, emoji `$=`
  - `persistence.test.ts`: debounced shadow observers, tag pre-filtering, `waitUntil` error propagation
  - `adaptive.test.ts`: relocation and adaptive storage behavior
  - `predicates.test.ts`: custom save/read predicates and LRU eviction
  - `review-gaps.test.ts`: native setters, cross-iframe guards, entity bounds, snapshot helpers
  - `m2-stress.test.ts`: 50,000-operation LRU oracle comparison
  - `adversarial-m2.test.ts`, `index.test.ts`: adversarial regressions and public exports
- `test/node/`:
  - `dom-adapter.test.ts`: Node queries, relocation, `waitFor` polling, `watch()` observer contract, actionable adapter errors
  - `element-handle.test.ts`: `Selector.fromHandle` snapshotting and handle rejection paths
  - `support/linkedom-adapter.ts`: reference `DomAdapter` built on `linkedom` + `xpath`
  - Run with `pnpm test:node` (`vitest.node.config.ts`, `environment: 'node'`)
