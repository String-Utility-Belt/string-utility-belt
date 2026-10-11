import type { UtilityMeta } from '@/core/registry'

export const RELATED_LIMIT = 6
/** At most this many reciprocal links (see `relatedUtilities`) on top of a page's own `RELATED_LIMIT`. */
export const RECIPROCAL_LIMIT = 3
/** Reciprocal links top every utility up to this many links from other utility pages, where its picks have room. */
export const MIN_INBOUND = 2
/** How far down its own ranking (in multiples of the limit) a utility may look for pages with room for it. */
const HOST_REACH = 3

interface Scored { m: UtilityMeta; shared: number; same: boolean }

/** A page's own picks: shared tags say more than a shared category (url_decode ↔ url_encode live in different ones). */
function ownPicks(meta: UtilityMeta, all: UtilityMeta[], limit: number): UtilityMeta[] {
  const tags = new Set(meta.tags)
  return all
    .filter(m => m.id !== meta.id)
    .map((m): Scored => ({ m, shared: m.tags.filter(t => tags.has(t)).length, same: m.category === meta.category }))
    .filter(r => r.shared > 0 || r.same)
    .sort((a, b) => b.shared - a.shared || Number(b.same) - Number(a.same) || a.m.name.localeCompare(b.m.name))
    .slice(0, limit)
    .map(r => r.m)
}

/**
 * Every page's related list for one utility list and limit; built once, then shared by every page.
 * A utility that fewer than `MIN_INBOUND` pages pick is added, as a reciprocal link, to its own
 * closest matches (relatedness is symmetric) that still have room: up to `RECIPROCAL_LIMIT` per page.
 */
function relatedGraph(all: UtilityMeta[], limit: number): Map<string, UtilityMeta[]> {
  const own = new Map(all.map(m => [m.id, ownPicks(m, all, limit)]))
  const inbound = new Map(all.map(m => [m.id, 0]))
  for (const picks of own.values()) for (const r of picks) inbound.set(r.id, inbound.get(r.id)! + 1)
  const reciprocal = new Map(all.map(m => [m.id, [] as UtilityMeta[]]))
  const lists = (host: string, id: string) =>
    own.get(host)!.some(p => p.id === id) || reciprocal.get(host)!.some(p => p.id === id)

  const needy = all
    .filter(m => inbound.get(m.id)! < MIN_INBOUND)
    .sort((a, b) => inbound.get(a.id)! - inbound.get(b.id)! || a.name.localeCompare(b.name))
  for (const m of needy) {
    // its closest matches first, reaching past its own cut when those pages have no room left
    const hosts = ownPicks(m, all, limit * HOST_REACH)
      .filter(h => !lists(h.id, m.id) && reciprocal.get(h.id)!.length < RECIPROCAL_LIMIT)
      .slice(0, MIN_INBOUND - inbound.get(m.id)!)
    for (const h of hosts) reciprocal.get(h.id)!.push(m)
  }
  return new Map(all.map(m => [m.id, [...own.get(m.id)!, ...reciprocal.get(m.id)!]]))
}

const graphs = new WeakMap<UtilityMeta[], Map<number, Map<string, UtilityMeta[]>>>()

/**
 * Utilities to suggest next to `meta`, shared by the doc page and its pre-rendered snapshot:
 * its own `limit` best matches, then up to `RECIPROCAL_LIMIT` utilities that pick `meta` but
 * did not make its own cut and are linked from too few pages. Relatedness is symmetric, so the
 * reciprocal links are as relevant; without them a niche tool that loses every tie (ties go
 * by name) is linked from no other utility page at all.
 */
export function relatedUtilities(meta: UtilityMeta, all: UtilityMeta[], limit = RELATED_LIMIT): UtilityMeta[] {
  let byLimit = graphs.get(all)
  if (!byLimit) graphs.set(all, (byLimit = new Map()))
  let graph = byLimit.get(limit)
  if (!graph) byLimit.set(limit, (graph = relatedGraph(all, limit)))
  return graph.get(meta.id) ?? ownPicks(meta, all, limit)
}

/** A utility's crawlable, pre-rendered URL path. */
export const utilityPath = (id: string): string => `/util/${encodeURIComponent(id)}/`
