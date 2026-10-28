import type { DomAdapter } from './core/dom-adapter'

export interface BoundingRectInfo {
  x: number
  y: number
  width: number
  height: number
}

export interface ElementFingerprint {
  tag: string
  attributes: Record<string, string>
  text: string | null
  all_text?: string | null
  path: readonly string[]
  parent_name?: string
  parent_attribs?: Record<string, string>
  parent_text?: string | null
  siblings?: readonly string[]
  children?: readonly string[]
  semantic_attrs?: Record<string, string>
  stable_classes?: readonly string[]
  depth?: number
  sibling_index?: number
  rect?: BoundingRectInfo | null
}

export interface StorageSystem {
  readonly url?: string | null
  save(element: Element | ElementFingerprint, identifier: string): void | Promise<void>
  retrieve(identifier: string): ElementFingerprint | null | Promise<ElementFingerprint | null>
  close?(): void | Promise<void>
  hydrate?(): void | Promise<void>
  flush?(): void | Promise<void>
}

export interface SelectorOptions {
  content?: string | Uint8Array
  root?:
    | Element
    | Document
    | DocumentFragment
    | ShadowRoot
    | Node
    | {
        kind: 'element'
        element: Element
      }
    | {
        kind: 'text'
        textValue: string
        parentElement?: Element | null
      }
  url?: string
  adaptiveDomain?: string
  adaptive_domain?: string
  encoding?: string
  keepComments?: boolean
  keep_comments?: boolean
  adaptive?: boolean
  pierceShadow?: boolean
  pierce_shadow?: boolean
  storage?: StorageSystem | (new (options?: Record<string, unknown>) => StorageSystem)
  _storage?: StorageSystem
  storageArgs?: Record<string, unknown>
  storage_args?: Record<string, unknown>
  dom?: DomAdapter
}

export interface AdaptiveQueryOptions {
  identifier?: string
  adaptive?: boolean
  autoSave?: boolean
  auto_save?: boolean
  percentage?: number
  variables?: Record<string, string | number>
}

export interface GetAllTextOptions {
  separator?: string
  strip?: boolean
  ignoreTags?: readonly string[]
  ignore_tags?: readonly string[]
  validValues?: boolean
  valid_values?: boolean
}

export interface FindSimilarOptions {
  similarityThreshold?: number
  similarity_threshold?: number
  ignoreAttributes?: readonly string[]
  ignore_attributes?: readonly string[]
  matchText?: boolean
  match_text?: boolean
}

export interface FindByTextOptions {
  firstMatch?: boolean
  first_match?: boolean
  partial?: boolean
  caseSensitive?: boolean
  case_sensitive?: boolean
  cleanMatch?: boolean
  clean_match?: boolean
}

export interface FindByRegexOptions {
  firstMatch?: boolean
  first_match?: boolean
  caseSensitive?: boolean
  case_sensitive?: boolean
  cleanMatch?: boolean
  clean_match?: boolean
}

export interface RegexExtractOptions {
  replaceEntities?: boolean
  replace_entities?: boolean
  cleanMatch?: boolean
  clean_match?: boolean
  caseSensitive?: boolean
  case_sensitive?: boolean
  checkMatch?: boolean
  check_match?: boolean
}

export interface PagePersistenceWatcherOptions {
  identifier?: string
  selector: string
  mode?: 'auto' | 'css' | 'xpath' | 'text'
  percentage?: number
  autoUpdateFingerprint?: boolean
  root?: Element | Document
  filter?: (element: HTMLElement) => boolean
  variables?: Record<string, string | number>
  onResolved?: (element: HTMLElement, relocated: boolean, score?: number) => void
  onLost?: () => void
}

export interface CapturedElementInfo {
  identifier: string
  cssSelector: string
  fullCssSelector: string
  xpathSelector: string
  fullXpathSelector: string
  fingerprint: ElementFingerprint
}

export interface RelocationEvent {
  identifier: string
  brokenSelector: string
  newCssSelector: string
  newFullCssSelector: string
  newXpathSelector: string
  score: number
  url: string
  oldFingerprint: ElementFingerprint
  newElement: HTMLElement
}

export type RelocationCallback = (
  oldElement: ElementFingerprint,
  newElement: HTMLElement,
  event: RelocationEvent,
) => void

export type MouseButton = 'left' | 'right' | 'middle'
export type SelectorWaitState = 'attached' | 'detached' | 'visible' | 'hidden'

export interface MouseMoveAction {
  type: 'move'
  target?: string
  x?: number
  y?: number
  steps?: number
  timeout?: number
}

export interface MouseClickAction {
  type: 'click'
  target?: string
  x?: number
  y?: number
  button?: MouseButton
  click_count?: number
  delay?: number
  timeout?: number
}

export interface MouseWheelAction {
  type: 'wheel'
  delta_x?: number
  delta_y?: number
}

export interface TextFormFieldAction {
  type: 'textbox'
  target: string
  value: string
  clear?: boolean
  timeout?: number
}

export interface CheckboxFormFieldAction {
  type: 'checkbox'
  target: string
  value: boolean
  timeout?: number
}

export interface RadioFormFieldAction {
  type: 'radio'
  target: string
  value: true
  timeout?: number
}

export interface SelectFormFieldAction {
  type: 'combobox'
  target: string
  value: string | string[]
  timeout?: number
}

export interface KeyPressAction {
  type: 'press_key'
  key: string
}

export interface TimeWaitAction {
  type: 'wait_time'
  milliseconds: number
}

export interface ElementWaitAction {
  type: 'wait_element'
  target: string
  state?: SelectorWaitState
  timeout?: number
}

export interface LoadWaitAction {
  type: 'wait_load'
  state: 'domcontentloaded' | 'load' | 'networkidle'
  timeout?: number
}

export type BrowserAction =
  | MouseMoveAction
  | MouseClickAction
  | MouseWheelAction
  | TextFormFieldAction
  | CheckboxFormFieldAction
  | RadioFormFieldAction
  | SelectFormFieldAction
  | KeyPressAction
  | TimeWaitAction
  | ElementWaitAction
  | LoadWaitAction
