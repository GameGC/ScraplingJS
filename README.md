# scrapling-js (MVP Edition)

Minimal, JS-native adaptive web scraping library with self-healing `find()` and `findAll()`, pluggable storage, and `onRelocated(foundSuccessfully, info)` analytics.

## Core API

- `fromDocument(doc?, options?)` / `fromElement(el, options?)` / `fromHtml(html, options?)` / `fromPage(page, options?)`
- `page.find(selector, key?)`: Returns `Element | null` (auto-saves fingerprint when matched; self-heals when broken).
- `page.findAll(selector, key?)`: Returns `Element[]` (auto-saves anchor fingerprint when matched; self-heals all matching siblings/elements via `relocateAll` when broken).
- `page.text(selector, key?)` / `page.attr(selector, attrName, key?)`
- `setStorage({ loadAll(url), save(url, key, fingerprint) })` / `resetStorage()`
- `onRelocated((foundSuccessfully, info) => { ... })`: Fires whenever a selector misses in the DOM and adaptive relocation runs (`foundSuccessfully = true` if recovered, `false` if not found).
