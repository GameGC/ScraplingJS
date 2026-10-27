import { ElementHandleError } from '../core/errors'

export interface ElementHandleLike {
  evaluate<R>(pageFunction: (element: Element) => R): Promise<R>
  asElement?(): unknown
}

const HANDLE_METHODS = ['asElement', 'elementHandle', 'dispose', 'remoteObject'] as const

export function isRemoteHandle(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  if (typeof candidate.evaluate !== 'function') return false
  return HANDLE_METHODS.some((method) => typeof candidate[method] === 'function')
}

export function resolveElementHandle(handle: unknown): ElementHandleLike {
  if (!handle || typeof handle !== 'object' || typeof (handle as ElementHandleLike).evaluate !== 'function') {
    throw new ElementHandleError(
      'Selector.fromHandle() expects a Puppeteer or Playwright ElementHandle: an object with an evaluate() method.',
    )
  }

  const candidate = handle as ElementHandleLike
  if (typeof candidate.asElement !== 'function') {
    throw new ElementHandleError(
      'The given handle has no asElement() method, so it cannot be resolved to an element. Pass an ElementHandle (for example the result of `await page.$("selector")`) instead of a plain JSHandle or Page.',
    )
  }

  const element = candidate.asElement()
  if (!element || typeof (element as ElementHandleLike).evaluate !== 'function') {
    throw new ElementHandleError(
      'The given handle does not reference an element: asElement() returned null. The element may be detached or the selector may have matched nothing.',
    )
  }

  return element as ElementHandleLike
}

export async function readHandleOuterHtml(handle: ElementHandleLike): Promise<string> {
  const html = await handle.evaluate((element) => element.outerHTML)
  if (typeof html !== 'string' || html.length === 0) {
    throw new ElementHandleError(
      'The handle returned no outerHTML: the element is missing, detached, or is not a DOM element.',
    )
  }
  return html
}
