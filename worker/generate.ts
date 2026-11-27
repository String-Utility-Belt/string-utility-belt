/**
 * POST /api/generate — the AI pipeline builder: a visitor describes a job in words and gets back
 * pipeline steps built only from registered utilities, for the editor to load (REQ-027, NFR-007).
 *
 * Only this site's pages may call it, and it does nothing unless `AI_GENERATE` is `on` with the
 * API key, the IP salt and the D1 binding all present. Spending is capped three ways before the
 * model is called: an answer cache (a repeated description costs nothing), a per-client daily
 * count, and a daily budget that reserves each call's worst-case cost in one conditional D1 write
 * and settles it to the actual cost afterwards. The model sees only the description; never the
 * visitor's input, output or pipeline. Every step it returns is checked against the registry and
 * the parameter rules, and anything that fails is dropped and named in `notes`.
 *
 * Body `{ description }`. Reply `{ steps, why, notes?, cached }`, `why[i]` explaining `steps[i]`.
 * Errors are `{ error, code }`: ai_off 503 · ai_budget 503 · ai_rate 429 · ai_invalid 400/413 ·
 * ai_unusable 422 · ai_upstream 502 (403 cross-site and 405 carry no code).
 */
import { validateParams } from '../src/core/params'
import { GENERATE_PATH, MAX_DESCRIPTION_CHARS } from '../src/lib/generate'
import { sanitizeSteps } from '../src/core/serialize'
import { isUtilityStep, stepId } from '../src/core/steps'
import type { ParamSpec, Params, PipelineStep } from '../src/types/utility'
import {
  cacheKey, countIp, ipHash, readCache, releaseSpend, reserveSpend, settleSpend, uncountIp, utcDay, writeCache,
} from './ai-budget'
import { CODE_UTILITY_IDS, getCatalog, offeredParams, type Catalog } from './ai-catalog'
import {
  AiUpstreamError, MODEL_ID, anthropicModel, costMicro, worstCaseMicro, type AiModel, type AiResponse,
} from './ai-model'
import type { ApiEnv, ApiRegistry } from './env'
import { isCrossSite, json, jsonError, readCapped, TooLargeError } from './http'
import { rateLimitKey, type RateLimiter } from './rate-limit'

export { GENERATE_PATH, MAX_DESCRIPTION_CHARS }
export const MAX_GENERATE_BODY_BYTES = 2048
export const MAX_GENERATED_STEPS = 12
export const DEFAULT_DAILY_BUDGET_USD = 5
export const DEFAULT_IP_DAILY_LIMIT = 10
const MAX_WHY_CHARS = 200
const MAX_NOTES_CHARS = 1000

/**
 * The answer's shape. Parameters come back as name/value string pairs because structured output
 * needs a closed schema and every utility's parameters differ; each value is coerced by its kind.
 */
export const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    steps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          utilityId: { type: 'string' },
          params: {
            type: 'array',
            items: {
              type: 'object',
              properties: { name: { type: 'string' }, value: { type: 'string' } },
              required: ['name', 'value'],
              additionalProperties: false,
            },
          },
          why: { type: 'string' },
        },
        required: ['utilityId', 'params', 'why'],
        additionalProperties: false,
      },
    },
    notes: { type: 'string' },
  },
  required: ['steps', 'notes'],
  additionalProperties: false,
} as const

export interface GenerateDeps {
  registry: ApiRegistry
  /** Burst limiter in isolate memory, on top of the daily count in D1. */
  limiter: RateLimiter
  now: () => number
  /** The model for a request; the real Anthropic client unless a test injects a fake. */
  model?: (env: ApiEnv) => AiModel
}

interface Config {
  db: D1Database
  apiKey: string
  salt: string
  capMicro: number
  ipLimit: number
}

/** Settings, or null when the route must stay off (anything missing or malformed fails closed). */
function config(env: ApiEnv): Config | null {
  if (env.AI_GENERATE !== 'on' || !env.EVENTS_DB || !env.ANTHROPIC_API_KEY || !env.AI_IP_SALT) return null
  const usd = env.AI_DAILY_BUDGET_USD === undefined || env.AI_DAILY_BUDGET_USD === ''
    ? DEFAULT_DAILY_BUDGET_USD : Number(env.AI_DAILY_BUDGET_USD)
  const ipLimit = env.AI_IP_DAILY_LIMIT === undefined || env.AI_IP_DAILY_LIMIT === ''
    ? DEFAULT_IP_DAILY_LIMIT : Number(env.AI_IP_DAILY_LIMIT)
  if (!Number.isFinite(usd) || usd < 0 || !Number.isInteger(ipLimit) || ipLimit < 0) return null
  return { db: env.EVENTS_DB, apiKey: env.ANTHROPIC_API_KEY, salt: env.AI_IP_SALT, capMicro: Math.floor(usd * 1e6), ipLimit }
}

const fail = (status: number, code: string, error: string, headers: Record<string, string> = {}) =>
  jsonError(status, error, { code }, headers)

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

// ── Validation ───────────────────────────────────────────────────────────────

/** A step before checking: a utility id, typed params and the model's reason for it. */
export interface Candidate {
  utilityId: string
  params: Params
  why: string
}

type Coerced = { ok: true; value: unknown } | { ok: false; error: string }

/** A model's string value as the type its parameter kind holds. */
export function coerceValue(spec: ParamSpec, raw: string): Coerced {
  switch (spec.kind) {
    case 'number':
    case 'range': {
      const n = raw.trim() === '' ? NaN : Number(raw)
      return Number.isFinite(n) ? { ok: true, value: n } : { ok: false, error: 'must be a number' }
    }
    case 'boolean':
      if (/^true$/i.test(raw.trim())) return { ok: true, value: true }
      if (/^false$/i.test(raw.trim())) return { ok: true, value: false }
      return { ok: false, error: 'must be true or false' }
    case 'multiselect': {
      try {
        const v = JSON.parse(raw)
        if (Array.isArray(v)) return { ok: true, value: v.map(String) }
      } catch { /* a plain list */ }
      return { ok: true, value: raw.split(',').map(s => s.trim()).filter(Boolean) }
    }
    case 'keyvalue': {
      try {
        const v = JSON.parse(raw)
        if (Array.isArray(v) && v.every(p => Array.isArray(p) && p.length === 2)) {
          return { ok: true, value: v.map(([k, val]) => [String(k), String(val)]) }
        }
      } catch { /* fall through */ }
      return { ok: false, error: 'must be a list of key/value pairs' }
    }
    default:
      return { ok: true, value: raw }
  }
}

export interface Checked {
  candidates: Candidate[]
  /** One line per step left out, saying why. */
  dropped: string[]
}

/** The model's answer as candidates: params coerced by kind, unknown names ignored. */
export function fromModel(answer: unknown, catalog: Catalog): Checked & { notes: string } {
  const out: Checked & { notes: string } = { candidates: [], dropped: [], notes: '' }
  if (!isObj(answer) || !Array.isArray(answer.steps)) return out
  out.notes = typeof answer.notes === 'string' ? answer.notes.slice(0, MAX_NOTES_CHARS) : ''
  for (const raw of answer.steps) {
    if (!isObj(raw) || typeof raw.utilityId !== 'string') continue
    const utilityId = raw.utilityId.slice(0, 100)
    const meta = catalog.byId.get(utilityId)
    if (!meta) { out.dropped.push(`"${utilityId}" is not a utility this site offers`); continue }
    const specs = new Map(offeredParams(meta))
    const params: Params = {}
    let problem = ''
    for (const p of Array.isArray(raw.params) ? raw.params : []) {
      if (!isObj(p) || typeof p.name !== 'string' || typeof p.value !== 'string') continue
      const spec = specs.get(p.name)
      if (!spec) continue
      const c = coerceValue(spec, p.value)
      if (!c.ok) { problem = `${p.name} ${c.error}`; break }
      params[p.name] = c.value
    }
    if (problem) { out.dropped.push(`${utilityId}: ${problem}`); continue }
    out.candidates.push({ utilityId, params, why: typeof raw.why === 'string' ? raw.why.slice(0, MAX_WHY_CHARS) : '' })
  }
  return out
}

/**
 * Keep the candidates that are offered utilities with valid params; also applied to cached
 * answers, so an answer stored before a parameter rule changed is checked by today's rules.
 */
export function checkCandidates(list: unknown[], catalog: Catalog): Checked {
  const out: Checked = { candidates: [], dropped: [] }
  for (const c of list) {
    if (!isObj(c) || typeof c.utilityId !== 'string' || !isObj(c.params)) continue
    const meta = catalog.byId.get(c.utilityId)
    if (!meta || CODE_UTILITY_IDS.has(c.utilityId)) { out.dropped.push(`"${c.utilityId}" is not a utility this site offers`); continue }
    if (out.candidates.length >= MAX_GENERATED_STEPS) { out.dropped.push(`${c.utilityId}: more than ${MAX_GENERATED_STEPS} steps`); continue }
    const allowed = new Set(offeredParams(meta).map(([name]) => name))
    const params: Params = {}
    for (const [k, v] of Object.entries(c.params)) if (allowed.has(k)) params[k] = v
    const errors = Object.entries(validateParams(meta, params))
    if (errors.length) { out.dropped.push(`${c.utilityId}: ${errors.map(([k, e]) => `${k} ${e}`).join('; ')}`); continue }
    out.candidates.push({ utilityId: c.utilityId, params, why: typeof c.why === 'string' ? c.why.slice(0, MAX_WHY_CHARS) : '' })
  }
  return out
}

/** Pipeline steps for the editor: sanitized like any untrusted pipeline, code steps never included. */
export function toSteps(candidates: Candidate[]): PipelineStep[] {
  const steps = sanitizeSteps(candidates.map(c => ({ id: stepId(), enabled: true, utilityId: c.utilityId, params: c.params })))
  return steps.filter(s => !(isUtilityStep(s) && CODE_UTILITY_IDS.has(s.utilityId)))
}

const joinNotes = (notes: string, dropped: string[]) =>
  [notes.trim(), ...dropped.map(d => `Left out ${d}.`)].filter(Boolean).join('\n').slice(0, MAX_NOTES_CHARS * 2)

function reply(candidates: Candidate[], notes: string, cached: boolean): Response {
  return json({
    steps: toSteps(candidates),
    why: candidates.map(c => c.why),
    ...(notes ? { notes } : {}),
    cached,
  }, 200, { 'cache-control': 'no-store' })
}

/** Seconds until the next UTC midnight, when the daily count starts again. */
const untilTomorrow = (now: number) => Math.max(1, Math.ceil((86_400_000 - (now % 86_400_000)) / 1000))

// ── Route ────────────────────────────────────────────────────────────────────

export async function handleGenerate(request: Request, env: ApiEnv, deps: GenerateDeps): Promise<Response> {
  if (request.method !== 'POST') return jsonError(405, 'use POST', {}, { allow: 'POST' })
  if (isCrossSite(request)) return jsonError(403, 'the pipeline builder only answers this site')
  const cfg = config(env)
  if (!cfg) return fail(503, 'ai_off', 'the AI pipeline builder is not available')

  const ip = request.headers.get('cf-connecting-ip')
  const wait = deps.limiter.hit(rateLimitKey(ip))
  if (wait) return fail(429, 'ai_rate', `too many requests; try again in ${wait} s`, { 'retry-after': String(wait) })

  let body: Uint8Array
  try {
    body = await readCapped(request.body, MAX_GENERATE_BODY_BYTES)
  } catch (e) {
    if (e instanceof TooLargeError) return fail(413, 'ai_invalid', `the body is at most ${MAX_GENERATE_BODY_BYTES} bytes`)
    throw e
  }
  let raw: unknown
  try { raw = JSON.parse(new TextDecoder().decode(body)) } catch { return fail(400, 'ai_invalid', 'the body is not JSON') }
  const description = isObj(raw) && typeof raw.description === 'string' ? raw.description.trim() : ''
  if (!description) return fail(400, 'ai_invalid', 'describe what the pipeline should do')
  if (description.length > MAX_DESCRIPTION_CHARS) {
    return fail(400, 'ai_invalid', `a description is at most ${MAX_DESCRIPTION_CHARS} characters`)
  }

  const catalog = await getCatalog(deps.registry)
  const now = deps.now()
  const key = await cacheKey(description, MODEL_ID, catalog.version)

  const hit = await readCache(cfg.db, key, now)
  if (hit) {
    let stored: unknown
    try { stored = JSON.parse(hit.steps) } catch { stored = null }
    const checked = checkCandidates(Array.isArray(stored) ? stored : [], catalog)
    if (checked.candidates.length) return reply(checked.candidates, joinNotes(hit.notes, checked.dropped), true)
  }

  const day = utcDay(now)
  const hash = await ipHash(cfg.salt, day, ip)
  if (!(await countIp(cfg.db, day, hash, cfg.ipLimit))) {
    const s = untilTomorrow(now)
    return fail(429, 'ai_rate', 'that is all the AI pipelines for today; try again tomorrow', { 'retry-after': String(s) })
  }

  const modelRequest = { system: catalog.system, description, schema: OUTPUT_SCHEMA as unknown as Record<string, unknown> }
  const worst = worstCaseMicro(modelRequest)
  if (!(await reserveSpend(cfg.db, day, worst, cfg.capMicro))) {
    await uncountIp(cfg.db, day, hash)
    return fail(503, 'ai_budget', 'the AI pipeline builder has used its budget for today')
  }

  let answer: AiResponse
  try {
    answer = await (deps.model ?? (() => anthropicModel({ apiKey: cfg.apiKey })))(env).generate(modelRequest)
  } catch (e) {
    const charged = !(e instanceof AiUpstreamError) || e.charged
    if (!charged) {
      await releaseSpend(cfg.db, day, worst)
      await uncountIp(cfg.db, day, hash)
    }
    // the reason only: never the description
    console.error('generate: model call failed', e instanceof Error ? e.message : 'unknown error')
    return fail(502, 'ai_upstream', 'the AI model could not be reached; try again later')
  }

  try {
    await settleSpend(cfg.db, day, costMicro(answer.usage) - worst)
  } catch (e) {
    // the worst case stays reserved, which errs on the side of spending less
    console.error('generate: settling spend failed', e instanceof Error ? e.message : 'unknown error')
  }

  if (answer.stopReason === 'refusal') return fail(422, 'ai_unusable', 'the AI model would not build this pipeline')
  let parsed: unknown
  try { parsed = answer.text === null ? null : JSON.parse(answer.text) } catch { parsed = null }
  const fromAnswer = fromModel(parsed, catalog)
  const checked = checkCandidates(fromAnswer.candidates, catalog)
  const notes = joinNotes(fromAnswer.notes, [...fromAnswer.dropped, ...checked.dropped])
  if (!checked.candidates.length) {
    return jsonError(422, 'no usable steps came back for that description', { code: 'ai_unusable', ...(notes ? { notes } : {}) })
  }

  await writeCache(cfg.db, key, { steps: JSON.stringify(checked.candidates), notes }, now)
  return reply(checked.candidates, notes, false)
}
