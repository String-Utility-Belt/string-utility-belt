import { describe, expect, it } from 'vitest'
import type { UtilityMeta } from '@/core/registry'
import { MANIFEST } from '@/utilities/_generated/manifest'
import { MIN_INBOUND, RECIPROCAL_LIMIT, RELATED_LIMIT, relatedUtilities } from './related'

const meta = (id: string, category: string, tags: string[]): UtilityMeta =>
  ({ ...MANIFEST[0], id, name: id, category, tags, aliases: [] }) as UtilityMeta

const ids = (list: UtilityMeta[]) => list.map(m => m.id)

describe('relatedUtilities', () => {
  it('ranks shared tags above a shared category', () => {
    const all = [
      meta('url_encode', 'Encoding', ['url', 'percent']),
      meta('url_decode', 'Decoding', ['url', 'percent']),
      meta('base64_encode', 'Encoding', ['base64']),
    ]
    expect(ids(relatedUtilities(all[0], all))).toEqual(['url_decode', 'base64_encode'])
  })

  it('links a utility that loses every tie from the pages it picks itself', () => {
    // nine equal matches: with a limit of 2, every page's own cut takes the first names, never `zz`
    const all = [...'abcdefgh'.split(''), 'zz'].map(id => meta(id, 'Lines', ['lines']))
    const own = (m: UtilityMeta) => ids(relatedUtilities(m, all, 2)).slice(0, 2)
    expect(all.filter(m => own(m).includes('zz'))).toEqual([])
    const linkedFrom = all.filter(m => ids(relatedUtilities(m, all, 2)).includes('zz')).map(m => m.id)
    expect(linkedFrom).toHaveLength(MIN_INBOUND)
  })

  it('never lists a page itself or twice, and stays within its limits', () => {
    for (const m of MANIFEST) {
      const related = ids(relatedUtilities(m, MANIFEST))
      expect(related, m.id).not.toContain(m.id)
      expect(new Set(related).size, m.id).toBe(related.length)
      expect(related.length, m.id).toBeLessThanOrEqual(RELATED_LIMIT + RECIPROCAL_LIMIT)
    }
  })

  // a page only /utilities/ links to is all but invisible to a crawler (SE Ranking's "one inbound internal link")
  it('links every utility from other utility pages', () => {
    const inbound = new Map(MANIFEST.map(m => [m.id, 0]))
    for (const m of MANIFEST) for (const r of relatedUtilities(m, MANIFEST)) inbound.set(r.id, inbound.get(r.id)! + 1)
    const peers = (m: UtilityMeta) =>
      MANIFEST.filter(o => o.id !== m.id && (o.category === m.category || o.tags.some(t => m.tags.includes(t)))).length
    const short = MANIFEST
      .filter(m => inbound.get(m.id)! < Math.min(MIN_INBOUND, peers(m)))
      .map(m => `${m.id}: linked from ${inbound.get(m.id)} utility page(s)`)
    expect(short).toEqual([])
  })

  it('gives the same answer every time', () => {
    const m = MANIFEST.find(u => u.id === 'semver')!
    expect(ids(relatedUtilities(m, MANIFEST))).toEqual(ids(relatedUtilities(m, [...MANIFEST])))
  })
})
