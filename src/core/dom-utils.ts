export function isElementNode(value: unknown): value is Element {
  return Boolean(value) && typeof value === 'object' && (value as Node).nodeType === 1
}

export function isInputElement(el: unknown): el is HTMLInputElement {
  if (!el || typeof el !== 'object') return false
  if (typeof HTMLInputElement !== 'undefined' && el instanceof HTMLInputElement) return true
  const win = (el as Node).ownerDocument?.defaultView
  return Boolean(win?.HTMLInputElement && el instanceof win.HTMLInputElement)
}

export function isTextAreaElement(el: unknown): el is HTMLTextAreaElement {
  if (!el || typeof el !== 'object') return false
  if (typeof HTMLTextAreaElement !== 'undefined' && el instanceof HTMLTextAreaElement) return true
  const win = (el as Node).ownerDocument?.defaultView
  return Boolean(win?.HTMLTextAreaElement && el instanceof win.HTMLTextAreaElement)
}

export function isHtmlElement(el: unknown): el is HTMLElement {
  if (!el || typeof el !== 'object') return false
  if (typeof HTMLElement !== 'undefined' && el instanceof HTMLElement) return true
  const win = (el as Node).ownerDocument?.defaultView
  return Boolean(win?.HTMLElement && el instanceof win.HTMLElement)
}

export function isElementVisible(element?: Element | null): boolean {
  if (!element) return false
  const view =
    element.ownerDocument?.defaultView ?? (typeof window !== 'undefined' ? window : undefined)
  if (typeof view?.getComputedStyle === 'function') {
    const style = view.getComputedStyle(element)
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.visibility === 'collapse' ||
      style.opacity === '0'
    ) {
      return false
    }
  }
  const rect = element.getBoundingClientRect()
  if (rect.width > 0 && rect.height > 0) {
    return true
  }
  if (isHtmlElement(element) && element.offsetWidth > 0 && element.offsetHeight > 0) {
    return true
  }
  return element.getClientRects().length > 0
}

function applyNativeProperty<T extends HTMLElement, K extends keyof T>(
  el: T,
  proto: object,
  prop: K,
  value: T[K],
): void {
  const ownSetter = Object.getOwnPropertyDescriptor(el, prop)?.set
  const protoSetter = Object.getOwnPropertyDescriptor(proto, prop)?.set
  if (typeof ownSetter === 'function') {
    ownSetter.call(el, value)
  } else if (typeof protoSetter === 'function') {
    protoSetter.call(el, value)
  } else {
    el[prop] = value
  }
}

export function setNativeInputValue(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): void {
  const isInput = isInputElement(el)
  const isTextarea = isTextAreaElement(el)
  if (!isInput && !isTextarea) {
    throw new TypeError('Target element is not an HTMLInputElement or HTMLTextAreaElement')
  }
  const view = el.ownerDocument?.defaultView
  const proto = isTextarea
    ? (view?.HTMLTextAreaElement?.prototype ?? HTMLTextAreaElement.prototype)
    : (view?.HTMLInputElement?.prototype ?? HTMLInputElement.prototype)
  applyNativeProperty(el, proto, 'value', value)
  if (typeof InputEvent !== 'undefined') {
    el.dispatchEvent(new InputEvent('input', { bubbles: true, data: value }))
  } else {
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

export function setNativeCheckboxValue(
  el: HTMLInputElement,
  checked: boolean,
): void {
  if (!isInputElement(el)) {
    throw new TypeError('Target element is not an HTMLInputElement')
  }
  const view = el.ownerDocument?.defaultView
  const proto = view?.HTMLInputElement?.prototype ?? HTMLInputElement.prototype
  applyNativeProperty(el, proto, 'checked', checked)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}
