/**
 * Opening the feedback dialog from anywhere: the footer, the end of a blog post, a search that
 * found nothing. A window event, like the command palette's, so callers need neither a provider
 * nor the dialog's chunk; `FeedbackHost` (mounted once by `AppShell`) answers it.
 */
import type { MouseEvent } from 'react'
import type { FeedbackKind } from '@/lib/feedback'
import { isPlainLeftClick } from '@/lib/router'

export const EVENT_OPEN_FEEDBACK = 'sub:open-feedback'

/** Where a feedback link goes on a modified click, or before the app runs: the contact page's form. */
export const FEEDBACK_HREF = '/contact/#feedback'

export interface OpenFeedbackDetail {
  kind?: FeedbackKind
  /** Text to start the message with; the caret goes after it. */
  message?: string
}

export function openFeedback(detail: OpenFeedbackDetail = {}): void {
  window.dispatchEvent(new CustomEvent<OpenFeedbackDetail>(EVENT_OPEN_FEEDBACK, { detail }))
}

/** A plain click on a link to `FEEDBACK_HREF` opens the form in place, over the page it was clicked on. */
export function openFeedbackFromLink(e: MouseEvent<HTMLAnchorElement>, detail: OpenFeedbackDetail = {}): void {
  if (!isPlainLeftClick(e, e.currentTarget)) return
  e.preventDefault()
  openFeedback(detail)
}

/** Longer search text is cut, in whole characters, so the message it starts stays well inside the limit. */
const QUERY_MAX = 200

/** "Suggest it" under a utility search that found nothing: a suggestion that names what was searched for. */
export function suggestUtility(query: string): void {
  const searched = Array.from(query.trim()).slice(0, QUERY_MAX).join('')
  openFeedback({ kind: 'utility', message: `I searched for “${searched}” and would like a utility that ` })
}
