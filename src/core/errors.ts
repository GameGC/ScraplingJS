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
