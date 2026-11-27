/**
 * Asks the Worker's AI pipeline builder (`POST /api/generate`) for steps that do what a
 * description says (REQ-027). Only the description is sent: never the input, output or
 * current pipeline. The reply is checked again here before the editor sees it, the same
 * way a share link is: steps are sanitized, and only known, non-code utilities are kept.
 */
import type { PipelineStep } from '@/types/utility'
import { sanitizeSteps } from '@/core/serialize'
import { isUtilityStep } from '@/core/steps'
import { registry } from '@/app/registry'
import { CODE_UTILITIES } from '@/app/share/trust'
import { GENERATE_ERROR_CODES, GENERATE_PATH, MAX_DESCRIPTION_CHARS, type GenerateErrorCode } from '@/lib/generate'

export { MAX_DESCRIPTION_CHARS }

export interface GeneratedStep {
  step: PipelineStep
  /** The model's one-line reason for this step ('' when it gave none). */
  why: string
}

/** What a request came to. `offline` covers no Worker (a dev server), a network error or a reply that is not the route's. */
export type GenerateResult =
  | { status: 'ok'; steps: GeneratedStep[]; notes?: string; cached: boolean }
  | { status: 'error'; code: GenerateErrorCode | 'offline'; message?: string; notes?: string; retryAfter?: number }

const MAX_WHY = 200
const MAX_NOTES = 2000

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const isCode = (v: unknown): v is GenerateErrorCode => (GENERATE_ERROR_CODES as readonly unknown[]).includes(v)

/** Keeps each reply step that sanitizes to one known, non-code utility step, with its reason. */
export function checkGenerated(rawSteps: unknown, rawWhy: unknown): GeneratedStep[] {
  if (!Array.isArray(rawSteps)) return []
  const why = Array.isArray(rawWhy) ? rawWhy : []
  const out: GeneratedStep[] = []
  rawSteps.forEach((raw, i) => {
    const [step] = sanitizeSteps([raw])
    if (!step || !isUtilityStep(step) || !registry.has(step.utilityId) || CODE_UTILITIES.has(step.utilityId)) return
    out.push({ step, why: text(why[i], MAX_WHY) })
  })
  return out
}

export async function generatePipeline(description: string, opts: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {}): Promise<GenerateResult> {
  const fetchImpl = opts.fetchImpl ?? fetch
  let res: Response
  try {
    res = await fetchImpl(GENERATE_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ description: description.trim().slice(0, MAX_DESCRIPTION_CHARS) }),
      credentials: 'omit',
      signal: opts.signal,
    })
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e
    return { status: 'error', code: 'offline' }
  }
  // a dev server's fallback page is a 200 HTML page, not an answer
  if (!(res.headers.get('content-type') ?? '').includes('application/json')) return { status: 'error', code: 'offline' }
  const body: unknown = await res.json().catch(() => null)
  if (!isObj(body)) return { status: 'error', code: 'offline' }
  const notes = text(body.notes, MAX_NOTES) || undefined

  if (res.ok) {
    const steps = checkGenerated(body.steps, body.why)
    if (!steps.length) return { status: 'error', code: 'ai_unusable', notes }
    return { status: 'ok', steps, notes, cached: body.cached === true }
  }
  if (!isCode(body.code)) return { status: 'error', code: 'offline' }
  const retryAfter = Number(res.headers.get('retry-after')) || undefined
  return { status: 'error', code: body.code, message: text(body.error, 300) || undefined, notes, retryAfter }
}
