import { describe, expect, it } from 'vitest'
import {
  calculateSimilarityScore,
  PagePersistenceManager,
  type ElementFingerprint,
} from '../src'
import { relocateBest } from '../src/core/relocator'

describe('ignoreAttributes in relocation scoring', () => {
  it('excludes ignored attributes from similarity and single-element relocation', () => {
    const fingerprint: ElementFingerprint = {
      tag: 'a',
      attributes: { href: '/old' },
      text: 'Apply',
      path: ['html', 'body', 'a'],
    }

    const scope = document.createElement('div')
    const candidate = document.createElement('a')
    candidate.setAttribute('href', '/new')
    candidate.textContent = 'Apply'
    scope.appendChild(candidate)
    document.body.appendChild(scope)

    const withBonus = calculateSimilarityScore(fingerprint, candidate)
    const ignored = calculateSimilarityScore(fingerprint, candidate, undefined, ['href'])
    expect(ignored).toBeGreaterThan(withBonus)

    const relaxed = relocateBest(fingerprint, scope, 95, undefined, false, ['href'])
    expect(relocateBest(fingerprint, scope, 95)).toBeNull()
    expect(relaxed?.element).toBe(
      candidate,
    )

    scope.remove()
  })

  it('threads manager ignoreAttributes through relocateWithScore and relocateAllWithScore', async () => {
    const container = document.createElement('div')
    container.innerHTML = '<button data-version="v2">Apply now</button>'
    document.body.appendChild(container)

    const manager = new PagePersistenceManager({
      document,
      url: 'https://relocation-options.example.com',
      percentage: 95,
      ignoreAttributes: ['data-version'],
    })

    manager.storage.save(
      {
        tag: 'button',
        attributes: { 'data-version': 'v1' },
        text: 'Apply now',
        path: ['html', 'body', 'div', 'button'],
      },
      'apply-now',
    )

    const single = manager.relocateWithScore('apply-now', 95, container)
    expect(single?.element.textContent).toBe('Apply now')
    expect(single?.score).toBeGreaterThanOrEqual(95)

    const all = manager.relocateAllWithScore('apply-now', 95, container)
    expect(all.length).toBeGreaterThan(0)
    expect(all[0].element.textContent).toBe('Apply now')

    await manager.destroy()
    container.remove()
  })
})
