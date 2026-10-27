export class SelectorSyntaxError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SelectorSyntaxError'
  }
}

export class SelectorError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SelectorError'
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
