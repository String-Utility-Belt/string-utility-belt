/** Posts one message to the Worker (`POST /api/feedback`) and says what became of it. */
import { FEEDBACK_PATH, type FeedbackField, type FeedbackRequest } from '@/lib/feedback'

export type SendResult =
  | { status: 'sent' }
  /** The Worker refused it; the form checks the same rules first, so this is rare. */
  | { status: 'invalid'; field?: FeedbackField; error: string }
  | { status: 'limited'; retryAfter: number }
  /** Not sent: no Worker here, email not set up, delivery failed or offline. The form offers the visitor's email app. */
  | { status: 'unavailable' }

const FIELDS: readonly string[] = ['kind', 'message', 'email', 'page'] satisfies FeedbackField[]

export async function sendFeedback(request: FeedbackRequest, fetchImpl: typeof fetch = fetch): Promise<SendResult> {
  let res: Response
  try {
    res = await fetchImpl(FEEDBACK_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
      credentials: 'omit',
    })
  } catch {
    return { status: 'unavailable' }
  }
  // exactly the Worker's answer: a dev server's fallback page is a 200, not a sent message
  if (res.status === 204) return { status: 'sent' }
  if (res.status === 429) return { status: 'limited', retryAfter: Number(res.headers.get('retry-after')) || 60 }
  if (res.status === 400) {
    const body = await res.json().catch(() => null) as { error?: unknown; field?: unknown } | null
    if (typeof body?.error === 'string') {
      const field = typeof body.field === 'string' && FIELDS.includes(body.field) ? body.field as FeedbackField : undefined
      return { status: 'invalid', field, error: body.error }
    }
  }
  return { status: 'unavailable' }
}
