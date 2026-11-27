import React, { useEffect, useId, useRef, useState } from 'react'
import { cloneWithNewIds, isUtilityStep } from '@/core/steps'
import { useTool } from '@/app/ToolContext'
import { registry } from '@/app/registry'
import { useT } from '@/app/i18n/useT'
import Dialog from '@/app/library/Dialog'
import { generatePipeline, MAX_DESCRIPTION_CHARS, type GenerateResult } from './generate'

export interface GenerateDialogProps {
  onClose: () => void
  /** Focus target on close when the dialog was not opened from a focused control. */
  returnFocus?: React.RefObject<HTMLElement | null>
}

/** A daily-count refusal waits until midnight UTC; a burst refusal waits seconds. */
const TODAY_WAIT_S = 15 * 60

const LINK = 'underline underline-offset-[3px] hover:text-fg'

/**
 * The describe dialog (REQ-027): the visitor writes what the pipeline should do, the
 * Worker's AI builder answers with steps and a reason for each, and the visitor either
 * replaces the pipeline or adds them to the end. Either is one reducer action, so one
 * undo puts the previous pipeline back.
 */
export default function GenerateDialog({ onClose, returnFocus }: GenerateDialogProps) {
  const { state, dispatch } = useTool()
  const { t } = useT()
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<GenerateResult | null>(null)
  const boxRef = useRef<HTMLTextAreaElement>(null)
  const boxId = useId()
  const countId = useId()
  // a reply that lands after the dialog closed must not touch anything
  const abort = useRef<AbortController | null>(null)
  useEffect(() => () => abort.current?.abort(), [])

  const trimmed = description.trim()
  const hasPipeline = state.steps.length > 0

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!trimmed || busy) return
    abort.current?.abort()
    const ctl = new AbortController()
    abort.current = ctl
    setBusy(true)
    setResult(null)
    try {
      const r = await generatePipeline(trimmed, { signal: ctl.signal })
      if (!ctl.signal.aborted) setResult(r)
    } catch {
      // aborted: the dialog closed or a newer request replaced this one
    } finally {
      if (!ctl.signal.aborted) setBusy(false)
    }
  }

  const apply = (mode: 'replace' | 'append') => {
    if (result?.status !== 'ok') return
    const steps = result.steps.map(s => cloneWithNewIds(s.step))
    dispatch(mode === 'replace' ? { type: 'LOAD', steps } : { type: 'INSERT_STEPS', steps })
    onClose()
  }

  const errorText = (r: Extract<GenerateResult, { status: 'error' }>) => {
    if (r.code === 'ai_rate') {
      return r.retryAfter && r.retryAfter < TODAY_WAIT_S
        ? t('generate.error.rateSoon', { seconds: r.retryAfter })
        : t('generate.error.rateToday')
    }
    if (r.code === 'ai_invalid') return t('generate.error.ai_invalid', { max: MAX_DESCRIPTION_CHARS })
    return t(`generate.error.${r.code}`)
  }
  // when the builder cannot help today, point at the ways to build it by hand
  // REQ-027: whenever generation is unavailable, point to search and the MCP server.
  // A description that is too long is the visitor's to fix, so it gets no links.
  const offersFallback = (r: GenerateResult) => r.status === 'error' && r.code !== 'ai_invalid'

  return (
    <Dialog title={t('generate.title')} onClose={onClose} returnFocus={returnFocus} initialFocus={boxRef} widthClass="max-w-[600px]">
      <p className="m-0 text-[13px] text-muted text-pretty">
        {t('generate.intro')}{' '}
        <a className={LINK} href="/privacy/#features-that-contact-our-server">{t('generate.privacy')}</a>
      </p>

      <form className="grid gap-2" onSubmit={submit}>
        <label htmlFor={boxId} className="text-[13px] font-medium">{t('generate.label')}</label>
        <textarea
          ref={boxRef}
          id={boxId}
          className="field min-h-[84px] resize-y leading-5"
          maxLength={MAX_DESCRIPTION_CHARS}
          placeholder={t('generate.placeholder')}
          aria-describedby={countId}
          value={description}
          onChange={e => setDescription(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void submit() }}
        />
        <div className="flex items-center gap-2">
          <span id={countId} className="font-mono text-[11px] text-muted">
            {t('generate.count', { count: description.length, max: MAX_DESCRIPTION_CHARS })}
          </span>
          <div className="flex-1" />
          <button type="submit" className="cta h-[30px] px-3" disabled={!trimmed || busy}>
            {busy ? t('generate.building') : t('generate.submit')}
          </button>
        </div>
      </form>

      <div aria-live="polite" className="grid gap-3">
        {result?.status === 'ok' && (
          <>
            <section className="grid gap-1.5" aria-label={t('generate.stepsHeading')}>
              <h3 className="m-0 text-[13px] font-semibold">{t('generate.stepsHeading')}</h3>
              <ol className="m-0 pl-5 grid gap-1 text-[13px]">
                {result.steps.map(({ step, why }) => (
                  <li key={step.id}>
                    <span className="font-medium">
                      {isUtilityStep(step) ? registry.get(step.utilityId)?.name ?? t('generate.unknownUtility') : ''}
                    </span>
                    {why && <span className="text-muted"> — {why}</span>}
                  </li>
                ))}
              </ol>
            </section>
            {result.notes && <Notes title={t('generate.notesHeading')} notes={result.notes} />}
            <p className="m-0 text-[12.5px] text-muted">{t('generate.review')}</p>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" className="cta h-[30px] px-3" onClick={() => apply('replace')}>
                {hasPipeline ? t('generate.replace') : t('generate.use')}
              </button>
              {hasPipeline && (
                <button type="button" className="btn h-[30px] px-2.5" onClick={() => apply('append')}>{t('generate.append')}</button>
              )}
            </div>
          </>
        )}

        {result?.status === 'error' && (
          <div role="alert" className="grid gap-1.5 text-[13px]">
            <p className="m-0">{errorText(result)}</p>
            {result.notes && <Notes title={t('generate.notesHeading')} notes={result.notes} />}
            {offersFallback(result) && (
              <p className="m-0 text-muted">
                {t('generate.fallback')}{' '}
                <a className={LINK} href="/utilities/">{t('generate.search')}</a>{t('generate.or')}
                <a className={LINK} href="/integrations/#mcp-server-for-ai-agents">{t('generate.mcp')}</a>.
              </p>
            )}
          </div>
        )}
      </div>
    </Dialog>
  )
}

function Notes({ title, notes }: { title: string; notes: string }) {
  return (
    <div className="grid gap-0.5 text-[12.5px] text-muted">
      <span className="font-medium">{title}</span>
      <p className="m-0 whitespace-pre-line">{notes}</p>
    </div>
  )
}
