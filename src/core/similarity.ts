import type { ElementFingerprint } from '../types'
import { StorageTools, getElementDirectText } from './storage-tools'
import { cleanSpaces } from './utils'

export class SequenceMatcher<T = string> {
  private readonly a: ArrayLike<T>
  private readonly b: ArrayLike<T>
  private readonly b2j: Map<T, number[]>

  constructor(_isJunk: ((item: T) => boolean) | null, a: ArrayLike<T>, b: ArrayLike<T>) {
    this.a = a
    this.b = b
    this.b2j = new Map<T, number[]>()
    for (let i = 0; i < b.length; i++) {
      const elt = b[i]
      let indices = this.b2j.get(elt)
      if (!indices) {
        indices = []
        this.b2j.set(elt, indices)
      }
      indices.push(i)
    }
  }

  findLongestMatch(alo: number, ahi: number, blo: number, bhi: number): [number, number, number] {
    let besti = alo
    let bestj = blo
    let bestsize = 0
    let j2len = new Map<number, number>()

    for (let i = alo; i < ahi; i++) {
      const newj2len = new Map<number, number>()
      const indices = this.b2j.get(this.a[i])
      if (indices) {
        for (let idx = 0; idx < indices.length; idx++) {
          const j = indices[idx]
          if (j < blo) continue
          if (j >= bhi) break
          const k = (j2len.get(j - 1) ?? 0) + 1
          newj2len.set(j, k)
          if (k > bestsize) {
            besti = i - k + 1
            bestj = j - k + 1
            bestsize = k
          }
        }
      }
      j2len = newj2len
    }

    while (
      besti > alo &&
      bestj > blo &&
      this.a[besti - 1] === this.b[bestj - 1]
    ) {
      besti--
      bestj--
      bestsize++
    }
    while (
      besti + bestsize < ahi &&
      bestj + bestsize < bhi &&
      this.a[besti + bestsize] === this.b[bestj + bestsize]
    ) {
      bestsize++
    }

    return [besti, bestj, bestsize]
  }

  getMatchingBlocks(): Array<[number, number, number]> {
    const la = this.a.length
    const lb = this.b.length
    const queue: Array<[number, number, number, number]> = [[0, la, 0, lb]]
    const matchingBlocks: Array<[number, number, number]> = []

    while (queue.length > 0) {
      const [alo, ahi, blo, bhi] = queue.pop()!
      const [i, j, k] = this.findLongestMatch(alo, ahi, blo, bhi)
      if (k > 0) {
        matchingBlocks.push([i, j, k])
        if (alo < i && blo < j) {
          queue.push([alo, i, blo, j])
        }
        if (i + k < ahi && j + k < bhi) {
          queue.push([i + k, ahi, j + k, bhi])
        }
      }
    }

    matchingBlocks.sort((x, y) => x[0] - y[0] || x[1] - y[1])

    const nonAdjacent: Array<[number, number, number]> = []
    let i1 = 0
    let j1 = 0
    let k1 = 0
    for (const [i2, j2, k2] of matchingBlocks) {
      if (i1 + k1 === i2 && j1 + k1 === j2) {
        k1 += k2
      } else {
        if (k1 > 0) {
          nonAdjacent.push([i1, j1, k1])
        }
        i1 = i2
        j1 = j2
        k1 = k2
      }
    }
    if (k1 > 0) {
      nonAdjacent.push([i1, j1, k1])
    }
    nonAdjacent.push([la, lb, 0])
    return nonAdjacent
  }

  ratio(): number {
    const total = this.a.length + this.b.length
    if (total === 0) {
      return 1.0
    }
    if (this.a.length === 0 || this.b.length === 0) {
      return 0.0
    }
    let matches = 0
    for (const block of this.getMatchingBlocks()) {
      matches += block[2]
    }
    return (2.0 * matches) / total
  }
}

export function sequenceRatio<T = string>(a: ArrayLike<T>, b: ArrayLike<T>): number {
  return new SequenceMatcher<T>(null, a, b).ratio()
}

export function calculateDictDiff(
  dict1: Record<string, string>,
  dict2: Record<string, string>,
): number {
  const keys1 = Object.keys(dict1)
  const keys2 = Object.keys(dict2)
  const vals1 = Object.values(dict1)
  const vals2 = Object.values(dict2)
  const keyScore = sequenceRatio(keys1, keys2) * 0.5
  const valScore = sequenceRatio(vals1, vals2) * 0.5
  return keyScore + valScore
}

const NOISE_TOKENS = new Set([
  'css',
  'true',
  'false',
])

const ACTIVE_CLASS_TOKENS = new Set([
  'active',
  'on',
  'is-on',
  'selected',
  'is-selected',
  'current',
  'is-active',
])

function stemToken(token: string): string {
  if (token.endsWith('s') && token.length > 4) {
    return token.slice(0, -1)
  }
  return token
}

function extractTokensFromText(raw: string): string[] {
  const lower = raw
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/(\d),000\b/g, '$1k')
    .replace(/(\d+)k\b/g, '$1')
  const matches = lower.match(/[a-z]+|\d+/g)
  return matches ? matches : []
}

function extractSemanticTokens(fp: ElementFingerprint): Set<string> {
  const out = new Set<string>()
  const addFrom = (val: string | undefined | null, minLength = 3) => {
    if (!val) return
    for (const rawTok of extractTokensFromText(val)) {
      if (rawTok.length < minLength) continue
      if (NOISE_TOKENS.has(rawTok)) continue
      if (/^[0-9a-f]{5,}$/.test(rawTok) || /\d/.test(rawTok)) continue
      out.add(stemToken(rawTok))
    }
  }

  const attrs = fp.attributes ?? {}
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'style' || k === 'value') continue
    if (k === 'class') {
      for (const cls of fp.stable_classes ?? v.split(/\s+/)) {
        addFrom(cls, 3)
      }
    } else {
      addFrom(v, 3)
    }
  }

  const pAttrs = fp.parent_attribs ?? {}
  for (const [k, v] of Object.entries(pAttrs)) {
    if (
      k === 'aria-label' ||
      k === 'role' ||
      k === 'id' ||
      k === 'data-testid' ||
      k === 'data-test' ||
      k === 'data-qa' ||
      k === 'data-cy'
    ) {
      addFrom(v, 4)
    }
  }

  const textVal = fp.text ?? fp.all_text ?? ''
  if (textVal && textVal.length <= 32) {
    addFrom(textVal, 3)
  }

  return out
}

function hasActiveState(fp: ElementFingerprint): boolean {
  const attrs = fp.attributes ?? {}
  if (
    attrs['aria-selected'] === 'true' ||
    attrs['aria-pressed'] === 'true' ||
    Boolean(attrs['aria-current'])
  ) {
    return true
  }
  const cls = attrs.class ?? ''
  if (cls) {
    for (const part of cls.toLowerCase().split(/\s+/)) {
      if (ACTIVE_CLASS_TOKENS.has(part)) return true
    }
  }
  return false
}

function computeTextSimilarity(origRaw: string, candRaw: string): number {
  const rawCharScore = sequenceRatio(origRaw, candRaw)
  const origWords = extractTokensFromText(origRaw)
  const candWords = extractTokensFromText(candRaw)
  if (origWords.length === 0 || candWords.length === 0) {
    return rawCharScore
  }
  const cleanOrig = origWords.join(' ')
  const cleanCand = candWords.join(' ')
  const cleanCharScore = sequenceRatio(cleanOrig, cleanCand)
  const wordScore = sequenceRatio(origWords, candWords)
  return Math.max(rawCharScore, cleanCharScore, wordScore)
}

function computeTagSimilarity(
  original: ElementFingerprint,
  data: ElementFingerprint,
  sharedTokens: number,
): number {
  if (original.tag === data.tag) {
    return 1.0
  }
  const origRole = original.attributes?.role
  const candRole = data.attributes?.role

  const origIsButtonLike =
    original.tag === 'button' || origRole === 'button'
  const candIsButtonLike =
    data.tag === 'button' || candRole === 'button'

  if (origIsButtonLike && candIsButtonLike) {
    return 0.8
  }

  if (
    origIsButtonLike &&
    (candRole === 'option' || candRole === 'tab' || candRole === 'menuitem')
  ) {
    return 0.6
  }

  if (
    (original.tag === 'button' && data.tag === 'a' && sharedTokens > 0) ||
    (original.tag === 'a' && data.tag === 'button' && sharedTokens > 0)
  ) {
    return 0.75
  }

  return 0.0
}

export function calculateSimilarityScore(
  original: ElementFingerprint,
  candidate: Element | ElementFingerprint,
): number {
  let score = 0
  let checks = 0
  const data =
    typeof Element !== 'undefined' && candidate instanceof Element
      ? StorageTools.elementToDict(candidate)
      : (candidate as ElementFingerprint)

  const origTokens = extractSemanticTokens(original)
  const candTokens = extractSemanticTokens(data)
  let sharedTokenCount = 0
  for (const t of origTokens) {
    if (candTokens.has(t)) {
      sharedTokenCount++
    }
  }

  const tagScore = computeTagSimilarity(original, data, sharedTokenCount)
  score += tagScore
  checks += 1

  const origText = (original.text ?? original.all_text ?? '').trim()
  const candText = (data.text ?? data.all_text ?? '').trim()
  let textScore = -1

  if (origText) {
    textScore = computeTextSimilarity(origText, candText)
    const textWeight = origText.length <= 40 ? 2.0 : 1.25
    score += textScore * textWeight
    checks += textWeight
  }

  score += calculateDictDiff(original.attributes ?? {}, data.attributes ?? {})
  checks += 1

  for (const attrib of ['class', 'id', 'href', 'src'] as const) {
    const origVal = original.attributes?.[attrib]
    if (origVal) {
      const candVal = data.attributes?.[attrib]
      if (candVal !== undefined) {
        score += sequenceRatio(origVal, candVal)
        checks += 1
      } else {
        checks += 0.35
      }
    }
  }

  if (original.stable_classes && original.stable_classes.length > 0) {
    if (data.stable_classes && data.stable_classes.length > 0) {
      score += sequenceRatio(original.stable_classes, data.stable_classes)
      checks += 1
    }
  }

  if (original.semantic_attrs) {
    for (const [semKey, semVal] of Object.entries(original.semantic_attrs)) {
      if (semVal) {
        const candSemVal = data.semantic_attrs?.[semKey] ?? data.attributes?.[semKey]
        if (candSemVal !== undefined) {
          score += sequenceRatio(semVal, candSemVal)
          checks += 1
        } else if (semKey === 'placeholder' || semKey === 'name' || semKey === 'type') {
          checks += 0.5
        }
      }
    }
  }

  if (origTokens.size > 0 && candTokens.size > 0) {
    const tokenRatio = (2 * sharedTokenCount) / (origTokens.size + candTokens.size)
    score += tokenRatio
    checks += 1
  }

  if (hasActiveState(original)) {
    score += hasActiveState(data) ? 0.85 : 0
    checks += 0.85
  }

  score += sequenceRatio(original.path ?? [], data.path ?? [])
  checks += 1

  if (original.parent_name && data.parent_name) {
    score += sequenceRatio(original.parent_name, data.parent_name)
    checks += 1

    score += calculateDictDiff(original.parent_attribs ?? {}, data.parent_attribs ?? {})
    checks += 1

    if (original.parent_text) {
      score += sequenceRatio(original.parent_text, data.parent_text ?? '')
      checks += 1
    }
  }

  const allowPositionalBonus =
    textScore < 0 ||
    textScore >= 0.5 ||
    (textScore >= 0.35 && sharedTokenCount >= 2)

  if (original.siblings && original.siblings.length > 0) {
    const sibWeight = 0.35
    if (allowPositionalBonus) {
      score += sequenceRatio(original.siblings, data.siblings ?? []) * sibWeight
    }
    checks += sibWeight
  }

  if (
    original.sibling_index !== undefined &&
    data.sibling_index !== undefined &&
    tagScore > 0
  ) {
    const idxWeight = 0.35
    if (allowPositionalBonus) {
      const diff = Math.abs(original.sibling_index - data.sibling_index)
      score += (1 / (1 + diff)) * idxWeight
    }
    checks += idxWeight
  }

  const result = Math.round((score / checks) * 100 * 100) / 100

  if (origText && origText.length <= 40 && textScore < 0.25 && sharedTokenCount === 0) {
    return Math.min(result, 25)
  }

  return result
}

export function filterAttributes(
  element: Element,
  ignoreAttributes: readonly string[],
): Record<string, string> {
  const ignoreSet = new Set(ignoreAttributes)
  const out: Record<string, string> = {}
  for (let i = 0; i < element.attributes.length; i++) {
    const attr = element.attributes.item(i)
    if (attr && !ignoreSet.has(attr.name)) {
      out[attr.name] = attr.value
    }
  }
  return out
}

export function areElementsAlike(
  original: Element,
  originalAttributes: Record<string, string>,
  candidate: Element,
  ignoreAttributes: readonly string[],
  similarityThreshold: number,
  matchText = false,
): boolean {
  const candidateAttributes =
    ignoreAttributes.length > 0
      ? filterAttributes(candidate, ignoreAttributes)
      : filterAttributes(candidate, [])

  let score = 0
  let checks = 0

  const origEntries = Object.entries(originalAttributes)
  const candCount = Object.keys(candidateAttributes).length

  if (origEntries.length > 0) {
    for (const [k, v] of origEntries) {
      score += sequenceRatio(v, candidateAttributes[k] ?? '')
    }
    checks += Math.max(origEntries.length, candCount)
  } else {
    if (candCount === 0) {
      score += 1
      checks += 1
    }
  }

  if (matchText) {
    score += sequenceRatio(
      cleanSpaces(getElementDirectText(original)),
      cleanSpaces(getElementDirectText(candidate)),
    )
    checks += 1
  }

  if (checks > 0) {
    return Math.round((score / checks) * 100) / 100 >= similarityThreshold
  }
  return false
}
