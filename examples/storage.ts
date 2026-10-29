/**
 * Storage adapters for ScraplingJS.
 *
 * Both adapters store one bucket per page URL:
 *
 *   https://shop.example/product/x100 -> { "buy-button": fingerprint, ... }
 *
 * The library calls:
 *
 *   save(url, key, fingerprint)
 *   loadAll(url)
 *
 * `key` is a plain selector identifier. The URL is the exact page URL, so a
 * redesign on the same page keeps its fingerprints, while another path starts
 * with its own bucket.
 */
import type { ElementFingerprint } from 'scrapling-js'

export type Bucket = Record<string, ElementFingerprint>

function readBucket(url: string): Bucket {
  try {
    const raw = localStorage.getItem(url)
    if (!raw) return {}

    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Bucket)
      : {}
  } catch {
    return {}
  }
}

/**
 * Simple synchronous adapter for extension pages or ordinary web pages.
 *
 * In a content script `localStorage` belongs to the visited site, not to the
 * extension: the site can read or clear it. Prefer `chromeStorage` below when
 * the data must belong to the extension.
 */
export const localStorageStorage = {
  loadAll: (url: string): Bucket => readBucket(url),

  save: (url: string, key: string, value: ElementFingerprint): void => {
    localStorage.setItem(
      url,
      JSON.stringify({
        ...readBucket(url),
        [key]: value,
      }),
    )
  },
}

interface ChromeStorageArea {
  get(key: string): Promise<Record<string, unknown>>
  set(items: Record<string, unknown>): Promise<void>
}

interface ChromeApi {
  storage: {
    local: ChromeStorageArea
  }
}

declare const chrome: ChromeApi

const writeQueues = new Map<string, Promise<void>>()

/**
 * Serializes read-modify-write updates for one URL. Without this, two quick
 * saves can both read the old bucket and the second one can drop the first
 * key.
 */
function enqueue(url: string, task: () => Promise<void>): Promise<void> {
  const previous = writeQueues.get(url) ?? Promise.resolve()
  const next = previous.then(task, task)

  writeQueues.set(url, next)
  next.then(
    () => {
      if (writeQueues.get(url) === next) writeQueues.delete(url)
    },
    () => {
      if (writeQueues.get(url) === next) writeQueues.delete(url)
    },
  )

  return next
}

/**
 * Adapter for `chrome.storage.local`.
 *
 * The queue protects saves made by this context. Two different tabs can still
 * write the same URL concurrently; for cross-tab atomicity use one storage key
 * per fingerprint instead of one bucket per page.
 */
export const chromeStorage = {
  async loadAll(url: string): Promise<Bucket> {
    const all = await chrome.storage.local.get(url)
    const bucket = all[url]
    return bucket && typeof bucket === 'object' && !Array.isArray(bucket)
      ? (bucket as Bucket)
      : {}
  },

  save(url: string, key: string, value: ElementFingerprint): Promise<void> {
    return enqueue(url, async () => {
      const all = await chrome.storage.local.get(url)
      const bucket = all[url]
      await chrome.storage.local.set({
        [url]: {
          ...(bucket && typeof bucket === 'object' && !Array.isArray(bucket)
            ? (bucket as Bucket)
            : {}),
          [key]: value,
        },
      })
    })
  },
}

/*
 * Usage
 *
 *   import { configureStorage, MemoryStorageSystem, Selector } from 'scrapling-js'
 *   import { chromeStorage } from './storage'
 *
 *   configureStorage(MemoryStorageSystem, chromeStorage)
 *
 *   const page = await Selector.fromDocument(document, location.href)
 *   const button = page.css('.buy-button', { identifier: 'buy-button' })[0]
 *   page.save(button, 'buy-button')
 */
