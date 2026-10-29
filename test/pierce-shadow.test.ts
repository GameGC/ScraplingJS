import { beforeEach, describe, expect, it } from 'vitest'
import {
  MemoryStorageSystem,
  PagePersistenceManager,
  Selector,
  StorageTools,
} from '../src'

function buildShadowPage(): { doc: Document; shadowButton: Element } {
  const doc = new DOMParser().parseFromString(
    `<!DOCTYPE html><html><body><div id="app"><section class="panel"><button class="light" type="button">Other action</button></section></div></body></html>`,
    'text/html',
  )
  const host = doc.querySelector('#app') as HTMLElement
  const shadow = host.attachShadow({ mode: 'open' })
  shadow.innerHTML =
    '<div class="inner"><button class="cta" type="button">Apply</button></div>'
  const shadowButton = shadow.querySelector('button')
  if (!shadowButton) {
    throw new Error('shadow fixture is broken')
  }
  return { doc, shadowButton }
}

describe('pierceShadow', () => {
  beforeEach(() => {
    MemoryStorageSystem.clearAll()
  })

  it('never relocates into the shadow tree when pierceShadow is disabled', () => {
    const { doc, shadowButton } = buildShadowPage()
    const fingerprint = StorageTools.elementToDict(shadowButton)
    const root = doc.documentElement

    const blind = new Selector({ root, pierceShadow: false })
    expect(blind.css('.cta').length).toBe(0)
    expect(blind.relocate(fingerprint, 40).includes(shadowButton)).toBe(false)
    expect(blind.relocate(fingerprint, 90)).toEqual([])

    const piercing = new Selector({ root })
    expect(piercing.css('.cta').length).toBe(1)
    const relocated = piercing.relocate(fingerprint, 40)
    expect(relocated.length).toBe(1)
    expect(relocated[0]).toBe(shadowButton)
  })

  it('keeps manager relocation aligned with the pierceShadow option', () => {
    const { doc, shadowButton } = buildShadowPage()
    const fingerprint = StorageTools.elementToDict(shadowButton)

    const storage = new MemoryStorageSystem({ url: 'shadow-domain' })
    storage.save(fingerprint, 'shadow-cta')
    expect(storage.retrieve('shadow-cta')).not.toBeNull()

    const blind = new PagePersistenceManager({
      document: doc,
      storage,
      adaptiveDomain: 'shadow-domain',
      pierceShadow: false,
    })
    expect(blind.restore('shadow-cta')).toBeNull()

    const piercing = new PagePersistenceManager({
      document: doc,
      adaptiveDomain: 'shadow-domain',
      pierceShadow: true,
    })
    const restored = piercing.restore('shadow-cta')
    expect(restored?.textContent).toContain('Apply')
  })
})
