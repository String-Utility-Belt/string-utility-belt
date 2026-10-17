import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { Check, Copy, Mail } from 'lucide-react'
import {
  checkFeedback, cleanMessage, FEEDBACK_ADDRESS, FEEDBACK_KINDS, feedbackMailto, feedbackPage, MESSAGE_MAX,
  type FeedbackField, type FeedbackKind, type FeedbackRequest,
} from '@/lib/feedback'
import { sendFeedback, type SendResult } from './send'

const KIND_BUTTONS: Record<FeedbackKind, string> = {
  utility: 'Suggest a utility',
  bug: 'Report a bug',
  other: 'Other feedback',
}

const HINTS: Record<FeedbackKind, string> = {
  utility: 'Describe the transformation you need, ideally with a short example input and the output you want.',
  bug: 'Say which utility you were using, what you expected and what happened. A share link helps; leave your input out if it’s private.',
  other: 'What works, what doesn’t, what you would change.',
}

/** The counter shows once a message is this close to the limit (`maxLength` cuts a paste silently). */
const COUNT_FROM = MESSAGE_MAX - 400

type Phase =
  | { name: 'editing' }
  | { name: 'sending' }
  | { name: 'sent'; email?: string }
  | { name: 'unavailable' }
  | { name: 'limited'; minutes: number }

export interface FeedbackFormProps {
  initialKind?: FeedbackKind
  /** Text the message starts with; the caret goes after it. */
  initialMessage?: string
  /** The message box, for a dialog to focus when it opens. */
  messageRef?: React.RefObject<HTMLTextAreaElement>
  /** Offered after sending, in place of "Send another message" (a dialog's Close). */
  onDone?: () => void
  /** The transport; tests replace it. */
  send?: (request: FeedbackRequest) => Promise<SendResult>
}

/**
 * Feedback, a bug report or a utility suggestion, emailed to us by the Worker. Checked with
 * the Worker's own rules before sending; when the Worker cannot send it, the visitor's email
 * app can, with the message written out.
 */
export default function FeedbackForm({ initialKind = 'utility', initialMessage = '', messageRef, onDone, send = sendFeedback }: FeedbackFormProps) {
  const [kind, setKind] = useState<FeedbackKind>(initialKind)
  const [message, setMessage] = useState(initialMessage)
  const [email, setEmail] = useState('')
  const [phase, setPhase] = useState<Phase>({ name: 'editing' })
  const [problem, setProblem] = useState<{ field?: FeedbackField; error: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const ownMessageRef = useRef<HTMLTextAreaElement>(null)
  const messageBox = messageRef ?? ownMessageRef
  const emailRef = useRef<HTMLInputElement>(null)
  // uncontrolled, so a script that sets `.value` without input events still trips it
  const websiteRef = useRef<HTMLInputElement>(null)
  const afterSendRef = useRef<HTMLButtonElement>(null)

  const id = useId()
  const ids = { kind: `${id}-kind`, message: `${id}-message`, hint: `${id}-hint`, count: `${id}-count`, email: `${id}-email`, error: `${id}-error` }

  // a dialog focuses the box after this runs: the caret then sits after the starting text
  useLayoutEffect(() => {
    const el = messageBox.current
    if (el && initialMessage) el.setSelectionRange(el.value.length, el.value.length)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- only the text the form opened with

  useEffect(() => { if (phase.name === 'sent') afterSendRef.current?.focus() }, [phase.name])

  const sending = phase.name === 'sending'
  const page = typeof window === 'undefined' ? undefined : feedbackPage(window.location.pathname)

  const focusField = (field?: FeedbackField) => {
    if (field === 'message') messageBox.current?.focus()
    else if (field === 'email') emailRef.current?.focus()
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (sending) return
    const website = websiteRef.current?.value ?? ''
    const check = checkFeedback({ kind, message, email, page, website })
    if (!check.ok) {
      setProblem(check)
      focusField(check.field)
      return
    }
    setProblem(null)
    setCopied(false)
    setPhase({ name: 'sending' })
    const result = await send({ ...check.feedback, website })
    switch (result.status) {
      case 'sent': setPhase({ name: 'sent', email: check.feedback.email }); break
      case 'limited': setPhase({ name: 'limited', minutes: Math.max(1, Math.ceil(result.retryAfter / 60)) }); break
      case 'unavailable': setPhase({ name: 'unavailable' }); break
      case 'invalid':
        setPhase({ name: 'editing' })
        setProblem(result)
        focusField(result.field)
    }
  }

  const reset = () => {
    setMessage('')
    setProblem(null)
    setPhase({ name: 'editing' })
  }

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(cleanMessage(message))
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  if (phase.name === 'sent') {
    return (
      <div className="grid gap-3">
        <div role="status" className="grid gap-1">
          <p className="m-0 text-[14px] font-medium">Thanks, your message is on its way to us.</p>
          <p className="m-0 text-[13px] text-muted">
            {phase.email
              ? `We’ll reply to ${phase.email}, although not always straight away.`
              : 'We read every message, although we can’t always act on it straight away.'}
          </p>
        </div>
        <div>
          {onDone
            ? <button ref={afterSendRef} type="button" className="btn" onClick={onDone}>Close</button>
            : <button ref={afterSendRef} type="button" className="btn" onClick={reset}>Send another message</button>}
        </div>
      </div>
    )
  }

  const fieldError = (field: FeedbackField) => (problem?.field === field ? problem.error : null)
  const describedBy = (...list: (string | false)[]) => list.filter(Boolean).join(' ') || undefined
  const mailto = phase.name === 'unavailable' && typeof window !== 'undefined'
    ? feedbackMailto({ kind, message: cleanMessage(message), page }, window.location.origin)
    : null

  return (
    <form noValidate onSubmit={submit} className="grid gap-4">
      <div className="grid gap-1.5 justify-items-start">
        <span id={ids.kind} className="text-[13px] font-medium">What is it about?</span>
        <div className="segmented flex-wrap" role="group" aria-labelledby={ids.kind}>
          {FEEDBACK_KINDS.map(k => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>{KIND_BUTTONS[k]}</button>
          ))}
        </div>
      </div>

      <div className="grid gap-1.5">
        <label htmlFor={ids.message} className="text-[13px] font-medium">Your message</label>
        <textarea
          id={ids.message}
          ref={messageBox}
          className="field min-h-32 resize-y leading-5"
          rows={6}
          maxLength={MESSAGE_MAX}
          value={message}
          onChange={e => { setMessage(e.target.value); if (problem?.field === 'message') setProblem(null) }}
          aria-invalid={fieldError('message') ? true : undefined}
          aria-describedby={describedBy(ids.hint, message.length >= COUNT_FROM && ids.count, !!fieldError('message') && ids.error)}
        />
        <p id={ids.hint} className="m-0 text-xs text-muted">{HINTS[kind]}</p>
        {message.length >= COUNT_FROM && (
          <p id={ids.count} aria-live="polite" className="m-0 font-mono text-[11px] text-muted">
            {(MESSAGE_MAX - message.length).toLocaleString()} characters left
          </p>
        )}
        {fieldError('message') && <p id={ids.error} className="m-0 text-xs text-danger">{fieldError('message')}</p>}
      </div>

      <div className="grid gap-1.5">
        <label htmlFor={ids.email} className="text-[13px] font-medium">
          Your email <span className="font-normal text-muted">(optional)</span>
        </label>
        <input
          id={ids.email}
          ref={emailRef}
          type="email"
          className="field"
          autoComplete="email"
          maxLength={254}
          value={email}
          onChange={e => { setEmail(e.target.value); if (problem?.field === 'email') setProblem(null) }}
          aria-invalid={fieldError('email') ? true : undefined}
          aria-describedby={describedBy(`${ids.email}-hint`, !!fieldError('email') && ids.error)}
        />
        <p id={`${ids.email}-hint`} className="m-0 text-xs text-muted">Only if you’d like a reply. We use it for nothing else.</p>
        {fieldError('email') && <p id={ids.error} className="m-0 text-xs text-danger">{fieldError('email')}</p>}
      </div>

      {/* never shown: people leave it empty, form-filling bots don't. No name or label autofill and password
          managers recognise ("website", "url"), or they would fill it and a real message would be dropped */}
      <div aria-hidden="true" className="absolute -left-[10000px] w-px h-px overflow-hidden">
        <label>Leave this empty <input ref={websiteRef} data-feedback-trap type="text" tabIndex={-1} autoComplete="off" defaultValue="" /></label>
      </div>

      <p className="m-0 text-xs text-muted">
        Leave out passwords, tokens and anything private: your message is emailed to us.{' '}
        <a href="/privacy/#features-that-contact-our-server" target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-fg">
          How we handle it
        </a>
      </p>

      {problem && !problem.field && <p role="alert" className="m-0 text-[13px] text-danger">{problem.error}</p>}

      {mailto && (
        <div role="alert" className="grid gap-2.5 p-3 border rounded-md bg-surface-2 text-[13px]">
          <p className="m-0">We couldn’t send your message from here. Your email app can send it instead, already written out.</p>
          <div className="flex flex-wrap gap-2">
            <a className="btn" href={mailto}><Mail size={14} aria-hidden />Open in your email app</a>
            <button type="button" className="btn" onClick={copyMessage}>
              {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}{copied ? 'Copied' : 'Copy message'}
            </button>
          </div>
          <p className="m-0 text-xs text-muted">
            Or write to <a href={`mailto:${FEEDBACK_ADDRESS}`} className="underline underline-offset-2 hover:text-fg">{FEEDBACK_ADDRESS}</a>.
          </p>
        </div>
      )}

      {phase.name === 'limited' && (
        <p role="alert" className="m-0 text-[13px]">
          You’ve sent several messages in the last hour. Try again in about {phase.minutes} {phase.minutes === 1 ? 'minute' : 'minutes'},
          or write to <a href={`mailto:${FEEDBACK_ADDRESS}`} className="underline underline-offset-2">{FEEDBACK_ADDRESS}</a>.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button type="submit" className="btn-inv" disabled={sending}>{sending ? 'Sending…' : 'Send'}</button>
        <span className="text-xs text-muted">
          or email <a href={`mailto:${FEEDBACK_ADDRESS}`} className="underline underline-offset-2 hover:text-fg">{FEEDBACK_ADDRESS}</a>
        </span>
      </div>
    </form>
  )
}
