/**
 * Storage adapters for the simple API.
 *
 *   import { setStorage } from 'scrapling-js'
 *   import { localStorageAdapter, chromeStorage } from './storage'
 *
 *   setStorage(localStorageAdapter)
 *   // or
 *   setStorage(chromeStorage)
 */

import type { ElementFingerprint } from 'scrapling-js'

type Bucket = Record<string, ElementFingerprint>

function readBucket(url: string): Bucket {
  try {
    const raw = localStorage.getItem(url)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

/** Browser localStorage adapter. */
export const localStorageAdapter = {
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

function enqueue(url: string, task: () => Promise<void>): Promise<void> {
  const previous = writeQueues.get(url) ?? Promise.resolve()
  const next = previous.then(task, task)
  writeQueues.set(url, next)
  next.then(
    () => { if (writeQueues.get(url) === next) writeQueues.delete(url) },
    () => { if (writeQueues.get(url) === next) writeQueues.delete(url) },
  )
  return next
}

/** chrome.storage.local adapter (Chrome Extension). */
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
 *   import { setStorage, fromDocument } from 'scrapling-js'
 *   import { chromeStorage } from './storage'
 *
 *   setStorage(chromeStorage)
 *
 *   const page = await fromDocument(document)
 *   const button = await page.find('.buy-button')
 */
