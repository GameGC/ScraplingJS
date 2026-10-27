# Project: scrapling-js Refactoring

## Architecture
- **Bounded In-Memory Cache on Hot Path**: `src/storage/memory.ts` provides an O(1) `LruMap` storage engine bounding both file buckets (`globalBuckets` ≤ 100) and entry counts (default 1000). All synchronous queries (`scrapling()`, `css()`, `xpath()`) resolve synchronously from this cache.
- **Custom Persistence Predicates & Merge-Only Hydration**: Persistence is delegated to optional user-defined `save(key, fingerprint)` and `read(key)` predicates. Asynchronous storage is preloaded via `hydrate()`, which follows merge-only semantics (newer in-memory entries are never overwritten). Unhydrated Promise returns during synchronous retrieval trigger an explicit runtime guard error.
- **Legacy Storage Deprecation**: `src/storage/local-storage.ts`, `src/storage/indexeddb.ts`, `src/storage/chrome-storage.ts`, and `src/storage/auto-storage.ts` are removed entirely. `MemoryStorageSystem` becomes the default storage engine throughout.
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

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | E2E & Unit Test Suite Creation | Tests for custom predicates, `localStorage` example, and 12 review test-gaps | none | DONE |
| M2 | Storage Engine & Custom Predicates | LRU `memory.ts`, user predicates, merge `hydrate()`, remove legacy files | none | DONE |
| M3 | Actions, Snapshot & DOM Utilities | `wait_load`, `timeout: 0`, `AbortSignal`, native setters, regex flags, Safari regex | none | DONE |
| M4 | Selector, Parser, Translator & Persistence | XPath/CSS variables, ID/attr escaping, codepoint length, debounced shadow observers | M3 | DONE |
| M5 | Type-Debt Elimination & Strict Hygiene | Discriminated union wrapper, zero `as any`, no index signatures, strict tsconfig, zero comments | M2, M3, M4 | DONE |
| M6 | Verification, Hard Bench & Repeat Review | 100% test pass, 36/36 benchmark recovery, repeat independent 4-agent code review | M1, M5 | DONE |

## Interface Contracts

### Storage Engine Contract (`src/storage/base.ts` & `src/storage/memory.ts`)
```ts
export type SavePredicate = (key: string, fingerprint: AdaptiveFingerprint) => void | Promise<void>
export type ReadPredicate = (key: string) => AdaptiveFingerprint | null | Promise<AdaptiveFingerprint | null>
export type ErrorHandler = (error: unknown, context: { operation: 'save' | 'read' | 'hydrate'; key?: string }) => void

export interface MemoryStorageOptions {
  storageFile?: string
  capacity?: number
  save?: SavePredicate
  read?: ReadPredicate
  onError?: ErrorHandler
}

export interface StorageSystem {
  storageFile: string
  save(identifier: string, data: AdaptiveFingerprint): void | Promise<void>
  retrieve(identifier: string): AdaptiveFingerprint | null | Promise<AdaptiveFingerprint | null>
  delete(identifier: string): void | Promise<void>
  clear(): void | Promise<void>
  hydrate?(): Promise<void> | void
  flush?(): Promise<void> | void
}
```

### Fingerprint Type Guard Contract (`src/storage/base.ts`)
```ts
export function isValidFingerprint(fp: unknown): fp is AdaptiveFingerprint {
  if (typeof fp !== 'object' || fp === null) return false
  const candidate = fp as Record<string, unknown>
  return (
    typeof candidate.tag === 'string' &&
    typeof candidate.attributes === 'object' &&
    candidate.attributes !== null &&
    typeof candidate.path === 'string'
  )
}
```

### Action Dispatcher & Native Setters (`src/core/utils.ts` & `src/actions/browser-actions.ts`)
```ts
export function setNativeInputValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void
export function setNativeCheckboxValue(el: HTMLInputElement, checked: boolean): void
export function isElementVisible(el: Element): boolean
export function parseQueryArguments(first: unknown, second: unknown): { query: string; options: AdaptiveQueryOptions }
```

### InternalNodeWrapper Discriminated Union (`src/parser/selector.ts`)
```ts
export type InternalNodeWrapper =
  | { kind: 'element'; element: Element }
  | { kind: 'text'; textValue: string; parentElement?: Element | null }
```

### Selector & Query Options Contract (`src/types.ts` & `src/parser/selector.ts`)
```ts
export interface AdaptiveQueryOptions {
  queryEngine?: string
  minConfidence?: number
  strategy?: 'hybrid' | 'css-first' | 'xpath-first'
  variables?: Record<string, string | number>
  storage?: StorageSystem
  save?: SavePredicate
  read?: ReadPredicate
  onError?: ErrorHandler
  storageCapacity?: number
}
```

## Code Layout
- `src/storage/`:
  - `base.ts`: Base storage types, `StorageSystem` interface, `isValidFingerprint` guard
  - `memory.ts`: `LruMap`, `MemoryStorageSystem`, user predicates, merge-only `hydrate()`, B-1/B-2 sync guard
  - `index.ts`: Re-export `base.ts` and `memory.ts` only (legacy files deleted)
- `src/actions/`:
  - `browser-actions.ts`: `runBrowserActions`, `validateActions`, `waitForDocumentLoad`, `waitForElementCondition`
- `src/snapshot/`:
  - `search.ts`: `searchSnapshot` with stripped `g`/`y` flags
  - `sanitizer.ts`: `sanitizeSnapshotHtml` with Safari < 16.4 compatible regex
- `src/parser/`:
  - `selector.ts`: `Selector` class, discriminated `InternalNodeWrapper`, safe variable replacer, `variables` in `css()`
- `src/core/`:
  - `utils.ts`: Unified helpers (`setNativeInputValue`, `setNativeCheckboxValue`, `isElementVisible`, `parseQueryArguments`, `escapeCssString`)
  - `mixins.ts`: `CSS.escape` / `xpathLiteral` ID escaping
  - `translator.ts`: Codepoint length `Array.from(val).length` for `$=`
- `src/persistence/`:
  - `page-persistence.ts`: Debounced shadow observers, tag pre-filtering, `waitUntil` error propagation, domain neutrality
  - `easy.ts`: Shared native value setters, deduplicated `parseQueryArguments`
- `test/`:
  - `storage.test.ts`: Custom `save`/`read` predicates, `localStorage` example, LRU eviction, B-1/B-2 guard
  - `actions.test.ts`: `wait_load` in iframe, `timeout: 0`, `AbortSignal`, native setters
  - `parser.test.ts`: XPath `$&` variable escaping, `css()` with `variables`, attribute key escaping, emoji `$=`
  - `snapshot.test.ts`: `/g` regex in `searchSnapshot`, Safari regex compatibility
  - `persistence.test.ts`: Debounced shadow observer, tag pre-filtering, `waitUntil` error propagation
