import type { ElementFingerprint } from '../types'
import {
  areElementsAlike,
  calculateSimilarityScore,
  filterAttributes,
  prepareFingerprint,
  type PreparedFingerprint,
} from './similarity'
import { collectDeepElements } from './shadow-dom'

const NON_TARGET_TAGS = new Set([
  'script',
  'style',
  'link',
  'meta',
  'noscript',
  'template',
])

const SEMANTIC_TAG_CHANGE_CONFIDENCE = 60

export interface RelocationMatch {
  element: Element
  score: number
}

export interface ScoredCandidates {
  scored: RelocationMatch[]
  best: RelocationMatch | null
}

export function resolveScopeRoot(
  root: Element | Document | undefined,
  doc: Document,
): Element {
  return !root || root.nodeType === 9
    ? ((root as Document | undefined)?.documentElement ?? doc.documentElement)
    : (root as Element)
}

export function scoreCandidates<T extends HTMLElement = HTMLElement>(
  scopeRoot: Element,
  fingerprint: ElementFingerprint,
  _percentage: number,
  filter?: (element: T) => boolean,
  pierceShadow = true,
  ignoreAttributes: readonly string[] = [],
): ScoredCandidates {
  const prepared = prepareFingerprint(fingerprint, ignoreAttributes)
  const skipNonTargets = !NON_TARGET_TAGS.has(fingerprint.tag)
  const candidates = collectDeepElements(scopeRoot, pierceShadow, false)
  const scored: RelocationMatch[] = []
  let best: RelocationMatch | null = null

  for (const candidate of candidates) {
    if (candidate.tagName.toLowerCase() !== fingerprint.tag) continue
    if (filter && !filter(candidate as T)) continue
    const match = buildMatch(fingerprint, candidate, prepared, ignoreAttributes)
    scored.push(match)
    if (!best || match.score > best.score) {
      best = match
    }
  }

  if (!best || best.score < SEMANTIC_TAG_CHANGE_CONFIDENCE) {
    for (const candidate of candidates) {
      const tag = candidate.tagName.toLowerCase()
      if (tag === fingerprint.tag) continue
      if (skipNonTargets && NON_TARGET_TAGS.has(tag)) continue
      if (filter && !filter(candidate as T)) continue
      const match = buildMatch(fingerprint, candidate, prepared, ignoreAttributes)
      scored.push(match)
      if (!best || match.score > best.score) {
        best = match
      }
    }
  }

  return { scored, best }
}

function buildMatch(
  fingerprint: ElementFingerprint,
  element: Element,
  prepared: PreparedFingerprint,
  ignoreAttributes: readonly string[],
): RelocationMatch {
  return {
    element,
    score: calculateSimilarityScore(fingerprint, element, prepared, ignoreAttributes),
  }
}

export function relocateHighestScoring(
  fingerprint: ElementFingerprint,
  scopeRoot: Element,
  percentage: number,
  pierceShadow = true,
  ignoreAttributes: readonly string[] = [],
): Element[] {
  const { scored, best } = scoreCandidates(
    scopeRoot,
    fingerprint,
    percentage,
    undefined,
    pierceShadow,
    ignoreAttributes,
  )
  if (!best || best.score < percentage) {
    return []
  }
  return scored
    .filter((match) => match.score === best.score)
    .map((match) => match.element)
}

export function relocateBest<T extends HTMLElement = HTMLElement>(
  fingerprint: ElementFingerprint,
  scopeRoot: Element,
  percentage: number,
  filter?: (element: T) => boolean,
  pierceShadow = true,
  ignoreAttributes: readonly string[] = [],
): RelocationMatch | null {
  const { best } = scoreCandidates<T>(
    scopeRoot,
    fingerprint,
    percentage,
    filter,
    pierceShadow,
    ignoreAttributes,
  )
  if (!best || best.score < percentage) {
    return null
  }
  return best
}

export function relocateAll<T extends HTMLElement = HTMLElement>(
  fingerprint: ElementFingerprint,
  scopeRoot: Element,
  percentage: number,
  ignoreAttributes: readonly string[],
  filter?: (element: T) => boolean,
  pierceShadow = true,
): RelocationMatch[] {
  const { scored, best } = scoreCandidates<T>(
    scopeRoot,
    fingerprint,
    percentage,
    filter,
    pierceShadow,
    ignoreAttributes,
  )
  if (!best || best.score < percentage) {
    return []
  }

  const primaryAttrs = filterAttributes(best.element, ignoreAttributes)
  const minCutoff = Math.max(25, percentage - 10)
  const matched: RelocationMatch[] = []

  for (const item of scored) {
    const isPrimary = item.element === best.element
    const isSameParentAlike =
      item.element.parentElement === best.element.parentElement &&
      areElementsAlike(
        best.element,
        primaryAttrs,
        item.element,
        ignoreAttributes,
        0.8,
        false,
      )
    const isAlike =
      isSameParentAlike ||
      (item.score >= minCutoff &&
        areElementsAlike(
          best.element,
          primaryAttrs,
          item.element,
          ignoreAttributes,
          0.5,
          false,
        ))
    if (isPrimary || isAlike) {
      matched.push(item)
    }
  }

  return matched
}
