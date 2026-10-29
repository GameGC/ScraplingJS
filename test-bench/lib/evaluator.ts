import {
  calculateSimilarityScore,
  MemoryStorageSystem,
  Selector,
  StorageTools,
} from '../../src'
import { TARGET_ELEMENTS, type TargetElementDef } from './targets'

export interface RelocationResult {
  targetId: string
  targetName: string
  description: string
  initialSelector: string
  traditionalFound: boolean
  traditionalCount: number
  adaptiveFound: boolean
  confidenceScore: number
  relocatedTag: string
  relocatedText: string
  matchedExpected: boolean
  durationMs: number
  fingerprintDiff: {
    tagChanged: boolean
    classChanged: boolean
    textMatched: boolean
    depthDelta: number
  }
}

export interface FrameworkBenchmarkResult {
  frameworkId: string
  frameworkName: string
  compilerMode: string
  totalTargets: number
  adaptiveSuccessful: number
  traditionalSuccessful: number
  averageScore: number
  results: RelocationResult[]
}

export function evaluateRelocation(
  baseHtml: string,
  mutatedHtml: string,
  frameworkId: string,
  frameworkName: string,
  compilerMode: string,
  targets: TargetElementDef[] = TARGET_ELEMENTS,
): FrameworkBenchmarkResult {
  const url = `https://indeed.com/jobs/${frameworkId}`

  // 1. Storage setup
  const baseStorage = new MemoryStorageSystem({ url })
  const basePage = new Selector(baseHtml, {
    url,
    adaptive: true,
    storage: baseStorage,
  })

  // 2. Train baseline fingerprints for each target
  const fingerprints = new Map<string, any>()
  for (const target of targets) {
    const found = basePage.css(target.initialSelector, { adaptive: false, autoSave: false })
    if (found.length > 0) {
      const el = found[0].rawNode
      if (el) {
        basePage.save(found[0], target.id)
        fingerprints.set(target.id, StorageTools.elementToDict(el))
      }
    }
  }

  // 3. Setup mutated page with access to the trained storage
  const mutatedPage = new Selector(mutatedHtml, {
    url,
    adaptive: true,
    storage: baseStorage,
  })

  const results: RelocationResult[] = []
  let adaptiveSuccessCount = 0
  let traditionalSuccessCount = 0
  let scoreSum = 0

  for (const target of targets) {
    const startTime = performance.now()

    // Test traditional query (adaptive: false)
    const traditionalResult = mutatedPage.css(target.initialSelector, {
      adaptive: false,
      autoSave: false,
    })
    const traditionalFound = traditionalResult.length > 0
    if (traditionalFound) {
      traditionalSuccessCount++
    }

    // Test ScraplingJS adaptive relocation
    const adaptiveResult = mutatedPage.css(target.initialSelector, {
      identifier: target.id,
      adaptive: true,
      autoSave: false,
      percentage: 30,
    })

    const durationMs = Math.round((performance.now() - startTime) * 100) / 100
    const adaptiveFound = adaptiveResult.length > 0

    let confidenceScore = 0
    let relocatedTag = ''
    let relocatedText = ''
    let matchedExpected = false

    const baseFp = fingerprints.get(target.id)
    let tagChanged = false
    let classChanged = false
    let textMatched = false
    let depthDelta = 0

    if (adaptiveFound) {
      const relocatedEl = adaptiveResult[0]
      const rawEl = relocatedEl.rawNode
      if (rawEl && baseFp) {
        confidenceScore = calculateSimilarityScore(baseFp, rawEl)
        relocatedTag = rawEl.tagName.toLowerCase()
        relocatedText = (rawEl.textContent || rawEl.getAttribute('placeholder') || '').trim()

        tagChanged = baseFp.tag !== relocatedTag
        classChanged = (baseFp.attributes?.class || '') !== (rawEl.className || '')
        depthDelta = Math.abs((baseFp.depth || 0) - StorageTools.getElementPath(rawEl).length)

        if (target.expectedTextSnippet) {
          matchedExpected = relocatedText.toLowerCase().includes(target.expectedTextSnippet.toLowerCase())
        } else if (target.expectedAttr) {
          const val = rawEl.getAttribute(target.expectedAttr.name) || ''
          matchedExpected = val.toLowerCase().includes(target.expectedAttr.valueSnippet.toLowerCase())
        } else {
          matchedExpected = true
        }
        textMatched = matchedExpected
      }

      if (matchedExpected && confidenceScore >= 35) {
        adaptiveSuccessCount++
      }
    }

    scoreSum += confidenceScore

    results.push({
      targetId: target.id,
      targetName: target.name,
      description: target.description,
      initialSelector: target.initialSelector,
      traditionalFound,
      traditionalCount: traditionalResult.length,
      adaptiveFound,
      confidenceScore,
      relocatedTag,
      relocatedText: relocatedText.slice(0, 80),
      matchedExpected,
      durationMs,
      fingerprintDiff: {
        tagChanged,
        classChanged,
        textMatched,
        depthDelta,
      },
    })
  }

  const averageScore = Math.round((scoreSum / targets.length) * 10) / 10

  return {
    frameworkId,
    frameworkName,
    compilerMode,
    totalTargets: targets.length,
    adaptiveSuccessful: adaptiveSuccessCount,
    traditionalSuccessful: traditionalSuccessCount,
    averageScore,
    results,
  }
}
