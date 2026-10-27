import type { ElementFingerprint } from '../types'
import {
  areElementsAlike,
  calculateSimilarityScore,
  filterAttributes,
} from './similarity'
import { collectDeepElements } from './shadow-dom'

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
  percentage: number,
  filter?: (element: T) => boolean,
): ScoredCandidates {
  const candidates = collectDeepElements(scopeRoot, true, false)
  const scored: RelocationMatch[] = []
  let best: RelocationMatch | null = null

  for (const candidate of candidates) {
    if (candidate.tagName.toLowerCase() !== fingerprint.tag) continue
    if (filter && !filter(candidate as T)) continue
    const score = calculateSimilarityScore(fingerprint, candidate)
    const match = { element: candidate, score }
    scored.push(match)
    if (!best || score > best.score) {
      best = match
    }
  }

  if (!best || best.score < percentage) {
    for (const candidate of candidates) {
      if (candidate.tagName.toLowerCase() === fingerprint.tag) continue
      if (filter && !filter(candidate as T)) continue
      const score = calculateSimilarityScore(fingerprint, candidate)
      const match = { element: candidate, score }
      scored.push(match)
      if (!best || score > best.score) {
        best = match
      }
    }
  }

  return { scored, best }
}

export function relocateHighestScoring(
  fingerprint: ElementFingerprint,
  scopeRoot: Element,
  percentage: number,
): Element[] {
  const { scored, best } = scoreCandidates(scopeRoot, fingerprint, percentage)
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
): RelocationMatch | null {
  const { best } = scoreCandidates<T>(scopeRoot, fingerprint, percentage, filter)
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
): RelocationMatch[] {
  const { scored, best } = scoreCandidates<T>(
    scopeRoot,
    fingerprint,
    percentage,
    filter,
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
