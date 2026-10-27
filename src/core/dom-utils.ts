export function isElementNode(value: unknown): value is Element {
  if (!value || typeof value !== 'object') return false
  return (value as Node).nodeType === 1
}

export function isInputElement(el: unknown): el is HTMLInputElement {
  if (!el || typeof el !== 'object') return false
  if (typeof HTMLInputElement !== 'undefined' && el instanceof HTMLInputElement) return true
  const win = (el as Node).ownerDocument?.defaultView
  return Boolean(win && win.HTMLInputElement && el instanceof win.HTMLInputElement)
}

export function isTextAreaElement(el: unknown): el is HTMLTextAreaElement {
  if (!el || typeof el !== 'object') return false
  if (typeof HTMLTextAreaElement !== 'undefined' && el instanceof HTMLTextAreaElement) return true
  const win = (el as Node).ownerDocument?.defaultView
  return Boolean(win && win.HTMLTextAreaElement && el instanceof win.HTMLTextAreaElement)
}

export function isSelectElement(el: unknown): el is HTMLSelectElement {
  if (!el || typeof el !== 'object') return false
  if (typeof HTMLSelectElement !== 'undefined' && el instanceof HTMLSelectElement) return true
  const win = (el as Node).ownerDocument?.defaultView
  return Boolean(win && win.HTMLSelectElement && el instanceof win.HTMLSelectElement)
}

export function isHtmlElement(el: unknown): el is HTMLElement {
  if (!el || typeof el !== 'object') return false
  if (typeof HTMLElement !== 'undefined' && el instanceof HTMLElement) return true
  const win = (el as Node).ownerDocument?.defaultView
  return Boolean(win && win.HTMLElement && el instanceof win.HTMLElement)
}

export function isElementVisible(element: Element | null | undefined): boolean {
  if (!element) return false
  const view =
    element.ownerDocument?.defaultView ?? (typeof window !== 'undefined' ? window : null)
  if (view && typeof view.getComputedStyle === 'function') {
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
  if (isHtmlElement(element)) {
    if (element.offsetWidth > 0 && element.offsetHeight > 0) {
      return true
    }
  }
  return element.getClientRects().length > 0
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
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value')
  const ownDescriptor = Object.getOwnPropertyDescriptor(el, 'value')
  if (ownDescriptor && typeof ownDescriptor.set === 'function') {
    ownDescriptor.set.call(el, value)
  } else if (descriptor && typeof descriptor.set === 'function') {
    descriptor.set.call(el, value)
  } else {
    el.value = value
  }
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
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'checked')
  const ownDescriptor = Object.getOwnPropertyDescriptor(el, 'checked')
  if (ownDescriptor && typeof ownDescriptor.set === 'function') {
    ownDescriptor.set.call(el, checked)
  } else if (descriptor && typeof descriptor.set === 'function') {
    descriptor.set.call(el, checked)
  } else {
    el.checked = checked
  }
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}
