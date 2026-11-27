// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { UtilityMeta } from '../src/core/registry'
import { MANIFEST } from '../src/utilities/_generated/manifest'
import { buildSystemPrompt, catalogUtilities, getCatalog, sha256Hex } from './ai-catalog'

const lines = (system: string) => system.split('\n').filter(l => l.startsWith('{')).map(l => JSON.parse(l))

describe('AI catalog', () => {
  it('leaves out custom_js and every utility that needs eval, dom or main', () => {
    const ids = catalogUtilities(MANIFEST).map(m => m.id)
    expect(ids).not.toContain('custom_js')
    for (const m of MANIFEST) {
      if (m.env.some(e => e === 'eval' || e === 'dom' || e === 'main')) expect(ids).not.toContain(m.id)
    }
    expect(ids).toContain('base64_decode')
    expect(ids).not.toContain('html_to_markdown')
    expect(lines(buildSystemPrompt(MANIFEST)).map(l => l.id)).toEqual(ids)
  })

  it('is sorted by id and byte-identical whatever order the registry lists utilities in', async () => {
    const shuffled = [...MANIFEST].reverse()
    const a = buildSystemPrompt(MANIFEST)
    expect(buildSystemPrompt(shuffled)).toBe(a)
    const ids = lines(a).map(l => l.id)
    expect(ids).toEqual([...ids].sort())
    const registry = (list: UtilityMeta[]) => ({ list: () => list, get: () => undefined, load: () => { throw new Error('unused') } })
    const [c1, c2] = await Promise.all([getCatalog(registry(MANIFEST)), getCatalog(registry(shuffled))])
    expect(c1.version).toBe(c2.version)
    expect(c1.version).toBe(await sha256Hex(a))
  })

  it('describes parameters with their kind, default, options and bounds, but never file params', () => {
    const byId = new Map(lines(buildSystemPrompt(MANIFEST)).map(l => [l.id, l]))
    expect(byId.get('aes_decrypt').params.iterations).toEqual({
      kind: 'number', label: 'pbkdf2 iterations', default: 100000, min: 1, max: 10000000, integer: true,
    })
    expect(byId.get('aes_decrypt').params.mode).toEqual({ kind: 'select', default: 'GCM', options: ['GCM', 'CBC'] })
    for (const m of MANIFEST) {
      for (const [name, spec] of Object.entries(m.params)) {
        if (spec.kind === 'file') expect(byId.get(m.id)?.params?.[name]).toBeUndefined()
      }
    }
  })

  it('changes version when a utility changes', async () => {
    const changed = MANIFEST.map(m => (m.id === 'base64_decode' ? { ...m, description: `${m.description}!` } : m))
    expect(await sha256Hex(buildSystemPrompt(changed))).not.toBe(await sha256Hex(buildSystemPrompt(MANIFEST)))
  })
})
