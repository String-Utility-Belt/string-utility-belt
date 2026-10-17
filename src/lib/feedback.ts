/**
 * Feedback and utility suggestions: the contract between the form that sends one
 * (`src/app/feedback/`) and the Worker that emails it to us (`worker/feedback.ts`).
 * Both check a message with `checkFeedback`, so the form says what is wrong before it
 * sends, and the Worker refuses anything the form would not have sent.
 *
 * Free of imports so the Worker bundles it without the app.
 */

export const FEEDBACK_PATH = '/api/feedback'

/** Where every message goes. The Worker's `send_email` binding can send nowhere else (wrangler.jsonc). */
export const FEEDBACK_ADDRESS = 'contact@stringutilitybelt.com'

export const FEEDBACK_KINDS = ['utility', 'bug', 'other'] as const

export type FeedbackKind = (typeof FEEDBACK_KINDS)[number]

export const FEEDBACK_KIND_LABELS: Record<FeedbackKind, string> = {
  utility: 'Utility suggestion',
  bug: 'Bug report',
  other: 'Feedback',
}

export const MESSAGE_MIN = 10
export const MESSAGE_MAX = 4000
const EMAIL_MAX = 254
const PAGE_MAX = 200

/** Larger bodies are refused unread: the longest valid message, JSON-escaped, stays under this. */
export const MAX_FEEDBACK_BYTES = 32 * 1024

export interface Feedback {
  kind: FeedbackKind
  /** Trimmed, with LF line endings and no control characters but tab and LF. */
  message: string
  /** Where to reply, when the visitor gave an address. */
  email?: string
  /** The path of the page it was sent from: never the query or fragment, which can carry input. */
  page?: string
}

/** What the form posts: a `Feedback`, plus `website`, a field people never see and bots fill in. */
export interface FeedbackRequest extends Feedback {
  website: string
}

export type FeedbackField = 'kind' | 'message' | 'email' | 'page'

export type FeedbackCheck =
  | { ok: true; feedback: Feedback; bot: boolean }
  | { ok: false; field?: FeedbackField; error: string }

const FIELDS: readonly string[] = ['kind', 'message', 'email', 'page', 'website']

// eslint-disable-next-line no-control-regex -- control characters are what this matches
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/g
/** One plain address, `name@host.tld`: no display name, comment, quoting or space. */
const EMAIL = /^[^@\s"<>(),;:\\[\]]+@[^@\s"<>(),;:\\[\]]+\.[^@\s"<>(),;:\\[\].]+$/
/** A URL path as `location.pathname` gives it: RFC 3986 path characters, percent-encoded otherwise. */
const PAGE = /^\/[A-Za-z0-9\-._~!$&'()*+,;=:@%/]*$/

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** The message as it is sent: CRLF and CR as LF, control characters (a pasted escape sequence) dropped, trimmed. */
export function cleanMessage(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(CONTROL, '').trim()
}

const fail = (error: string, field?: FeedbackField): FeedbackCheck => ({ ok: false, field, error })

/**
 * The feedback `raw` describes, cleaned, or the first thing wrong with it, worded for the
 * person writing it. `bot` is true when the hidden `website` field was filled in.
 */
export function checkFeedback(raw: unknown): FeedbackCheck {
  if (!isObject(raw)) return fail('Not a feedback message.')
  const extra = Object.keys(raw).find(k => !FIELDS.includes(k))
  if (extra !== undefined) return fail(`Unknown field “${extra.slice(0, 40)}”.`)

  const { kind, message, email, page, website } = raw
  if (typeof kind !== 'string' || !(FEEDBACK_KINDS as readonly string[]).includes(kind)) {
    return fail('Choose what your message is about.', 'kind')
  }
  if (typeof message !== 'string') return fail('Write a message.', 'message')
  const text = cleanMessage(message)
  if (text.length < MESSAGE_MIN) return fail(`Write a little more: at least ${MESSAGE_MIN} characters.`, 'message')
  if (text.length > MESSAGE_MAX) return fail(`Keep it to ${MESSAGE_MAX.toLocaleString('en')} characters or fewer.`, 'message')

  if (email !== undefined && typeof email !== 'string') return fail('Enter an email address, or leave it empty.', 'email')
  const address = email?.trim() ?? ''
  if (address && (address.length > EMAIL_MAX || !EMAIL.test(address))) {
    return fail('That email address doesn’t look right. Check it, or leave it empty.', 'email')
  }

  if (page !== undefined && (typeof page !== 'string' || page.length > PAGE_MAX || !PAGE.test(page))) {
    return fail('Not a page on this site.', 'page')
  }
  if (website !== undefined && typeof website !== 'string') return fail('Not a feedback message.')

  const feedback: Feedback = { kind: kind as FeedbackKind, message: text }
  if (address) feedback.email = address
  if (page !== undefined) feedback.page = page
  return { ok: true, feedback, bot: !!website?.trim() }
}

/** The `page` to send for a page at `pathname`, or none when it would not pass `checkFeedback` (an over-long path). */
export function feedbackPage(pathname: string): string | undefined {
  return pathname.length <= PAGE_MAX && PAGE.test(pathname) ? pathname : undefined
}

/** `Utility suggestion: <the first line, cut to 60 characters>`: the email's subject, and the mailto fallback's. */
export function feedbackSubject(f: Pick<Feedback, 'kind' | 'message'>): string {
  const label = FEEDBACK_KIND_LABELS[f.kind]
  const first = Array.from(f.message.split('\n', 1)[0].replace(/\s+/g, ' ').trim())
  if (!first.length) return label
  const gist = first.length > 60 ? `${first.slice(0, 59).join('').trimEnd()}…` : first.join('')
  return `${label}: ${gist}`
}

/** Longer `mailto:` links are cut off or refused by some mail apps. */
export const MAILTO_MAX = 2000

/**
 * A `mailto:` link that opens the visitor's own email app with the message written out,
 * for when the Worker cannot send it. A message too long for a link is cut, marked `…`.
 * Line breaks are CRLF, as RFC 6068 asks.
 */
export function feedbackMailto(f: Pick<Feedback, 'kind' | 'message' | 'page'>, origin: string): string {
  const footer = f.page ? `\n\n—\nSent from ${origin}${f.page}` : ''
  const href = (message: string) =>
    `mailto:${FEEDBACK_ADDRESS}?subject=${encodeURIComponent(feedbackSubject(f))}`
    + `&body=${encodeURIComponent(`${message}${footer}`.replace(/\n/g, '\r\n'))}`
  if (href(f.message).length <= MAILTO_MAX) return href(f.message)
  // the longest prefix, in code points, whose link still fits
  const chars = Array.from(f.message)
  let lo = 0
  let hi = chars.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (href(`${chars.slice(0, mid).join('')}…`).length <= MAILTO_MAX) lo = mid
    else hi = mid - 1
  }
  return href(`${chars.slice(0, lo).join('').trimEnd()}…`)
}
