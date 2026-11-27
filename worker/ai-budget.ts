/**
 * The AI pipeline builder's three D1 tables (migrations/0002_ai_generate.sql): the daily spend
 * that caps the bill, the per-client daily count, and the answer cache. Every write that guards
 * money is one conditional statement, so concurrent requests on any number of isolates cannot
 * pass a limit together. Days are UTC dates from the caller's clock, never SQL's `now`, so tests
 * can move time.
 */
import { rateLimitKey } from './rate-limit'

const DAY_MS = 86_400_000

export const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)

const changes = (r: D1Result) => r.meta?.changes ?? 0

// ── Spend ────────────────────────────────────────────────────────────────────

/**
 * Reserve `worstMicro` against today's cap. False when the reservation would pass the cap; then
 * nothing is reserved. The conditional UPDATE is the whole check: two requests cannot both see
 * room that only one of them fits in.
 */
export async function reserveSpend(db: D1Database, day: string, worstMicro: number, capMicro: number): Promise<boolean> {
  await db.prepare('INSERT INTO ai_spend (day, reserved_micro, calls) VALUES (?, 0, 0) ON CONFLICT (day) DO NOTHING')
    .bind(day).run()
  const r = await db.prepare(
    'UPDATE ai_spend SET reserved_micro = reserved_micro + ?, calls = calls + 1 WHERE day = ? AND reserved_micro + ? <= ?',
  ).bind(worstMicro, day, worstMicro, capMicro).run()
  return changes(r) === 1
}

/** Replace a reservation with what the call actually cost (`actual − worst`, usually negative). */
export async function settleSpend(db: D1Database, day: string, deltaMicro: number): Promise<void> {
  await db.prepare('UPDATE ai_spend SET reserved_micro = MAX(0, reserved_micro + ?) WHERE day = ?')
    .bind(deltaMicro, day).run()
}

/** Give back a reservation whose call never reached the model. */
export async function releaseSpend(db: D1Database, day: string, worstMicro: number): Promise<void> {
  await db.prepare('UPDATE ai_spend SET reserved_micro = MAX(0, reserved_micro - ?), calls = MAX(0, calls - 1) WHERE day = ?')
    .bind(worstMicro, day).run()
}

// ── Per-client daily count ───────────────────────────────────────────────────

/**
 * HMAC-SHA-256 under `salt` of the day and the client's address bucket (`rateLimitKey`: IPv6 by
 * /64). Without the salt the hash cannot be reversed by trying addresses, and a new day gives
 * the same client a new hash.
 */
export async function ipHash(salt: string, day: string, ip: string | null): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(salt), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${day}|${rateLimitKey(ip)}`))
  return [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('')
}

/** Count one model call for this client today; false (and nothing counted) once `limit` is reached. */
export async function countIp(db: D1Database, day: string, hash: string, limit: number): Promise<boolean> {
  const r = await db.prepare(
    'INSERT INTO ai_ip_daily (day, ip_hash, count) VALUES (?, ?, 1) ON CONFLICT (day, ip_hash) DO UPDATE SET count = count + 1 WHERE count < ?',
  ).bind(day, hash, limit).run()
  return changes(r) === 1
}

/** Take back a count for a request that ended up not calling the model. */
export async function uncountIp(db: D1Database, day: string, hash: string): Promise<void> {
  await db.prepare('UPDATE ai_ip_daily SET count = MAX(0, count - 1) WHERE day = ? AND ip_hash = ?').bind(day, hash).run()
}

// ── Answer cache ─────────────────────────────────────────────────────────────

export const CACHE_MAX_AGE_MS = 30 * DAY_MS

/** Trimmed, lower-cased, runs of whitespace collapsed to one space. */
export const normaliseDescription = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

export async function cacheKey(description: string, modelId: string, catalogVersion: string): Promise<string> {
  const text = `${normaliseDescription(description)}\n${modelId}\n${catalogVersion}`
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

export interface CachedAnswer { steps: string; notes: string }

export async function readCache(db: D1Database, key: string, nowMs: number): Promise<CachedAnswer | null> {
  const row = await db.prepare('SELECT steps, notes FROM ai_answer_cache WHERE key = ? AND created_at > ?')
    .bind(key, nowMs - CACHE_MAX_AGE_MS).first<CachedAnswer>()
  return row && typeof row.steps === 'string' ? { steps: row.steps, notes: String(row.notes ?? '') } : null
}

export async function writeCache(db: D1Database, key: string, answer: CachedAnswer, nowMs: number): Promise<void> {
  await db.prepare('INSERT OR REPLACE INTO ai_answer_cache (key, steps, notes, created_at) VALUES (?, ?, ?, ?)')
    .bind(key, answer.steps, answer.notes, nowMs).run()
}

// ── Pruning (daily cron) ─────────────────────────────────────────────────────

export const IP_RETENTION_DAYS = 2
export const SPEND_RETENTION_DAYS = 92

export async function pruneAi(db: D1Database | undefined, nowMs: number): Promise<void> {
  if (!db) return
  await db.prepare('DELETE FROM ai_ip_daily WHERE day < ?').bind(utcDay(nowMs - IP_RETENTION_DAYS * DAY_MS)).run()
  await db.prepare('DELETE FROM ai_spend WHERE day < ?').bind(utcDay(nowMs - SPEND_RETENTION_DAYS * DAY_MS)).run()
  await db.prepare('DELETE FROM ai_answer_cache WHERE created_at <= ?').bind(nowMs - CACHE_MAX_AGE_MS).run()
}
