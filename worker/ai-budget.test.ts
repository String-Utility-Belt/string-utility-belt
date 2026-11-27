// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  cacheKey, countIp, ipHash, normaliseDescription, pruneAi, readCache, releaseSpend, reserveSpend, settleSpend,
  uncountIp, utcDay, writeCache, CACHE_MAX_AGE_MS,
} from './ai-budget'
import { costMicro, worstCaseMicro, MAX_OUTPUT_TOKENS } from './ai-model'
import { sqliteD1 } from './test-d1'

const DAY = '2026-11-25'
const spend = (d: ReturnType<typeof sqliteD1>, day = DAY) =>
  d.sqlite.prepare('SELECT reserved_micro, calls FROM ai_spend WHERE day = ?').get(day) as { reserved_micro: number; calls: number } | undefined

describe('daily spend', () => {
  it('reserves until the next reservation would pass the cap, and never past it', async () => {
    const d = sqliteD1()
    expect(await reserveSpend(d.db, DAY, 400, 1000)).toBe(true)
    expect(await reserveSpend(d.db, DAY, 400, 1000)).toBe(true)
    expect(await reserveSpend(d.db, DAY, 400, 1000)).toBe(false)
    expect(await reserveSpend(d.db, DAY, 200, 1000)).toBe(true)
    expect(spend(d)).toEqual({ reserved_micro: 1000, calls: 3 })
  })

  it('lets concurrent reservations through only up to the cap', async () => {
    const d = sqliteD1()
    const results = await Promise.all(Array.from({ length: 50 }, () => reserveSpend(d.db, DAY, 300, 3000)))
    expect(results.filter(Boolean)).toHaveLength(10)
    expect(spend(d)).toEqual({ reserved_micro: 3000, calls: 10 })
  })

  it('settles to the actual cost, which frees room, and releases calls that never ran', async () => {
    const d = sqliteD1()
    await reserveSpend(d.db, DAY, 900, 1000)
    expect(await reserveSpend(d.db, DAY, 900, 1000)).toBe(false)
    await settleSpend(d.db, DAY, 120 - 900)
    expect(spend(d)).toEqual({ reserved_micro: 120, calls: 1 })
    expect(await reserveSpend(d.db, DAY, 800, 1000)).toBe(true)
    await releaseSpend(d.db, DAY, 800)
    expect(spend(d)).toEqual({ reserved_micro: 120, calls: 1 })
  })

  it('keeps a separate total per UTC day', async () => {
    const d = sqliteD1()
    expect(await reserveSpend(d.db, DAY, 1000, 1000)).toBe(true)
    expect(await reserveSpend(d.db, DAY, 1, 1000)).toBe(false)
    expect(await reserveSpend(d.db, '2026-11-26', 1000, 1000)).toBe(true)
    expect(utcDay(Date.UTC(2026, 10, 25, 23, 59, 59))).toBe(DAY)
    expect(utcDay(Date.UTC(2026, 10, 26, 0, 0, 0))).toBe('2026-11-26')
  })
})

describe('cost', () => {
  const request = { system: 'x'.repeat(30_000), description: 'decode base64', schema: { type: 'object' } }

  it('prices the worst case as every prompt byte at the cache-write price plus all output', () => {
    const tokens = 30_000 + 'decode base64'.length + JSON.stringify(request.schema).length + 4_000
    expect(worstCaseMicro(request)).toBe(Math.ceil(tokens * 0.1 * 1.25 + MAX_OUTPUT_TOKENS * 0.5))
  })

  it('prices a prompt past 100K tokens at the long-context rate', () => {
    const long = { ...request, system: 'x'.repeat(100_000) }
    const tokens = 100_000 + 'decode base64'.length + JSON.stringify(request.schema).length + 4_000
    expect(worstCaseMicro(long)).toBe(Math.ceil(tokens * 0.5 * 1.25 + MAX_OUTPUT_TOKENS * 2.5))
  })

  it('prices usage by kind of token, never above the worst case for the same prompt', () => {
    expect(costMicro({ input_tokens: 20, output_tokens: 200, cache_creation_input_tokens: 0, cache_read_input_tokens: 30_000 }))
      .toBe(Math.ceil(20 * 0.1 + 30_000 * 0.01 + 200 * 0.5))
    expect(costMicro({ input_tokens: 20, output_tokens: 200, cache_creation_input_tokens: 30_000, cache_read_input_tokens: null }))
      .toBe(Math.ceil(20 * 0.1 + 30_000 * 0.125 + 200 * 0.5))
    const firstCall = costMicro({ input_tokens: 20, output_tokens: MAX_OUTPUT_TOKENS, cache_creation_input_tokens: 30_000 })
    expect(firstCall).toBeLessThanOrEqual(worstCaseMicro(request))
  })
})

describe('per-client daily count', () => {
  it('allows `limit` calls per client per day, then refuses without counting', async () => {
    const d = sqliteD1()
    const h = await ipHash('salt', DAY, '203.0.113.7')
    for (let i = 0; i < 10; i++) expect(await countIp(d.db, DAY, h, 10)).toBe(true)
    expect(await countIp(d.db, DAY, h, 10)).toBe(false)
    expect(d.sqlite.prepare('SELECT count FROM ai_ip_daily').get()).toEqual({ count: 10 })
    await uncountIp(d.db, DAY, h)
    expect(await countIp(d.db, DAY, h, 10)).toBe(true)
  })

  it('hashes the address with the salt and the day, grouping an IPv6 /64', async () => {
    const a = await ipHash('salt', DAY, '2001:db8:1:2::5')
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(await ipHash('salt', DAY, '2001:db8:1:2:ffff::9')).toBe(a)
    expect(await ipHash('salt', '2026-11-26', '2001:db8:1:2::5')).not.toBe(a)
    expect(await ipHash('other', DAY, '2001:db8:1:2::5')).not.toBe(a)
    expect(await ipHash('salt', DAY, '2001:db8:1:3::5')).not.toBe(a)
    expect(a).not.toContain('2001')
  })
})

describe('answer cache', () => {
  it('keys on the normalised description, the model and the catalog version', async () => {
    expect(normaliseDescription('  Decode   BASE64\n then  pretty-print ')).toBe('decode base64 then pretty-print')
    const k = await cacheKey('Decode base64', 'm', 'v1')
    expect(await cacheKey('  decode   BASE64 ', 'm', 'v1')).toBe(k)
    expect(await cacheKey('Decode base64', 'm2', 'v1')).not.toBe(k)
    expect(await cacheKey('Decode base64', 'm', 'v2')).not.toBe(k)
    expect(k).toMatch(/^[0-9a-f]{64}$/)
  })

  it('returns an answer for 30 days, then not', async () => {
    const d = sqliteD1()
    const t = Date.UTC(2026, 10, 25)
    await writeCache(d.db, 'k', { steps: '[]', notes: 'n' }, t)
    expect(await readCache(d.db, 'k', t + 1000)).toEqual({ steps: '[]', notes: 'n' })
    expect(await readCache(d.db, 'k', t + CACHE_MAX_AGE_MS)).toBeNull()
    expect(await readCache(d.db, 'other', t)).toBeNull()
  })
})

describe('pruneAi', () => {
  it('deletes ip rows after 2 days, spend after 92 days and answers after 30 days', async () => {
    const d = sqliteD1()
    const now = Date.UTC(2026, 10, 25, 3, 17)
    for (const day of ['2026-11-22', '2026-11-23', '2026-11-25']) {
      await countIp(d.db, day, 'h', 10)
      await reserveSpend(d.db, day, 1, 10)
    }
    await reserveSpend(d.db, '2026-08-24', 1, 10)
    await reserveSpend(d.db, '2026-08-25', 1, 10)
    await writeCache(d.db, 'old', { steps: '[]', notes: '' }, now - CACHE_MAX_AGE_MS)
    await writeCache(d.db, 'new', { steps: '[]', notes: '' }, now - CACHE_MAX_AGE_MS + 1)
    await pruneAi(d.db, now)
    const col = (sql: string) => (d.sqlite.prepare(sql).all() as Array<Record<string, string>>).map(r => Object.values(r)[0])
    expect(col('SELECT day FROM ai_ip_daily ORDER BY day')).toEqual(['2026-11-23', '2026-11-25'])
    expect(col('SELECT day FROM ai_spend ORDER BY day')).toEqual(['2026-08-25', '2026-11-22', '2026-11-23', '2026-11-25'])
    expect(col('SELECT key FROM ai_answer_cache')).toEqual(['new'])
  })

  it('runs from the daily cron alongside the events prune', async () => {
    const { default: worker } = await import('./index')
    const d = sqliteD1()
    const now = Date.UTC(2026, 10, 25, 3, 17)
    await countIp(d.db, '2026-11-01', 'h', 10)
    const waits: Promise<unknown>[] = []
    await worker.scheduled({ scheduledTime: now, cron: '17 3 * * *' }, { EVENTS_DB: d.db },
      { waitUntil: p => waits.push(p), passThroughOnException: () => {} })
    await Promise.all(waits)
    expect(d.sqlite.prepare('SELECT COUNT(*) AS n FROM ai_ip_daily').get()).toEqual({ n: 0 })
    expect(d.log.some(sql => sql.startsWith('DELETE FROM events'))).toBe(true)
  })

  it('still prunes events when the AI tables are not migrated yet (a deploy before the migration)', async () => {
    const { default: worker } = await import('./index')
    const d = sqliteD1()
    d.sqlite.exec('DROP TABLE ai_ip_daily; DROP TABLE ai_spend; DROP TABLE ai_answer_cache')
    const waits: Promise<unknown>[] = []
    await worker.scheduled({ scheduledTime: Date.UTC(2026, 10, 25, 3, 17), cron: '17 3 * * *' }, { EVENTS_DB: d.db },
      { waitUntil: p => waits.push(p), passThroughOnException: () => {} })
    await expect(Promise.all(waits)).resolves.toBeDefined()
    expect(d.log.some(sql => sql.startsWith('DELETE FROM events'))).toBe(true)
    expect(d.log.some(sql => sql.startsWith('DELETE FROM ai_'))).toBe(true)
  })

  it('does nothing without the database', async () => {
    await expect(pruneAi(undefined, Date.now())).resolves.toBeUndefined()
  })
})
