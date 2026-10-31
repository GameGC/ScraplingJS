export class SelectorSyntaxError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SelectorSyntaxError'
  }
}

export class DomAdapterError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DomAdapterError'
  }
}

export class ElementHandleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ElementHandleError'
  }
}
