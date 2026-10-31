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

export interface PageContentProvider {
  content(): string | Promise<string>
  url?(): string
}

export interface SimpleStorage {
  loadAll(
    url: string,
  ): Promise<Record<string, ElementFingerprint>> | Record<string, ElementFingerprint>
  save(
    url: string,
    key: string,
    fingerprint: ElementFingerprint,
  ): Promise<void> | void
}

export interface RelocationInfo {
  foundSuccessfully: boolean
  key: string
  selector: string
  score: number
  element: Element | null
  elements: Element[]
  url: string
}

export type RelocatedCallback = (
  foundSuccessfully: boolean,
  info: RelocationInfo,
) => void

export interface PageOptions {
  url?: string
  threshold?: number
  pierceShadow?: boolean
  dom?: DomAdapter
  onRelocated?: RelocatedCallback
}

export interface AdaptiveQueryOptions {
  identifier?: string
  adaptive?: boolean
  autoSave?: boolean
  percentage?: number
  variables?: Record<string, string | number>
  [key: string]: unknown
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
  pierceShadow?: boolean
}

export interface FindByRegexOptions {
  firstMatch?: boolean
  first_match?: boolean
  caseSensitive?: boolean
  case_sensitive?: boolean
  cleanMatch?: boolean
  clean_match?: boolean
  pierceShadow?: boolean
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

export type FindPredicate =
  | string
  | Iterable<string>
  | Record<string, string>
  | RegExp
  | ((element: Element) => boolean)
