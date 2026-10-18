import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { Wand2, X } from 'lucide-react'
import { useTool } from '@/app/ToolContext'
import { countEvent } from '@/app/events/countEvent'
import type { Suggestion } from '@/core/detect'
import { useMagic } from './useMagic'
import { clampedPanelLeft } from './panelPosition'
import { seededParams } from './seed'
import SuggestionList from './SuggestionList'

/** Tab stops inside the dialog; disabled controls are skipped by the browser, so here too. */
const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Toolbar entry point for magic auto-detect. Mount as a child of `<PipelineToolbar>`.
 * Also opens on the `sub:magic` window event, so a command palette or shortcut
 * elsewhere in the app can trigger it without importing this component.
 */
export default function MagicButton() {
  const { state, input, run, dispatch, liveRun } = useTool()
  const [open, setOpen] = useState(false)
  const [decodingAll, setDecodingAll] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  /** Whether closing should return focus to the trigger (not after a click elsewhere). */
  const restoreFocus = useRef(false)
  const decodeCtrl = useRef<AbortController | null>(null)
  const titleId = useId()
  const [panelStyle, setPanelStyle] = useState<{ left: number; width: number } | null>(null)

  // The pipeline a run result belongs to: the one current when it landed (the runner
  // drops superseded runs). Edited since — manual mode, or a debounced live run not yet
  // started — and the result is stale.
  const [basis, setBasis] = useState(() => ({ result: run.result, steps: state.steps, input }))
  if (basis.result !== run.result) setBasis({ result: run.result, steps: state.steps, input })
  const stale = basis.steps !== state.steps || basis.input !== input

  // With steps, analyse the pipeline's output — and nothing until a finished run of the
  // current pipeline has produced one: nothing else is what an appended decoder would see.
  const hasSteps = state.steps.length > 0
  const waiting = hasSteps && (!run.result || run.running || stale)
  const autoRuns = liveRun && !run.largeInput?.paused && !run.failure
  const pending = run.running || (autoRuns && (!run.result || stale))
  const value = hasSteps ? run.result?.out ?? '' : input
  const magic = useMagic(value, open && !waiting)

  const openDialog = () => { setNotice(null); setOpen(true) }
  const closeDialog = (returnFocus: boolean) => { restoreFocus.current = returnFocus; setOpen(false) }

  useEffect(() => {
    const onExternalOpen = () => { setNotice(null); setOpen(true) }
    window.addEventListener('sub:magic', onExternalOpen)
    return () => window.removeEventListener('sub:magic', onExternalOpen)
  }, [])

  useEffect(() => {
    if (open) {
      dialogRef.current?.focus()
      return
    }
    decodeCtrl.current?.abort()
    if (restoreFocus.current) {
      restoreFocus.current = false
      buttonRef.current?.focus()
    }
  }, [open])

  // Cleared the moment the popover closes (during render, not an effect — see the React docs
  // on "adjusting state when a prop changes"), so the next open never briefly paints at a
  // stale position left over from before.
  if (!open && panelStyle) setPanelStyle(null)

  // Keep the popover on screen (see `clampedPanelLeft`): computed before paint so it never
  // flashes at its unclamped position, and kept current across a resize/rotation while open.
  useLayoutEffect(() => {
    if (!open) return
    const reposition = () => {
      if (!buttonRef.current || !wrapRef.current) return
      const buttonRight = buttonRef.current.getBoundingClientRect().right
      const wrapLeft = wrapRef.current.getBoundingClientRect().left
      setPanelStyle(clampedPanelLeft(buttonRight, wrapLeft, window.innerWidth))
    }
    reposition()
    window.addEventListener('resize', reposition)
    return () => window.removeEventListener('resize', reposition)
  }, [open])

  // a chain computed for an output the pipeline has since replaced must not be appended
  useEffect(() => () => decodeCtrl.current?.abort(), [value])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        restoreFocus.current = true
        setOpen(false)
        return
      }
      const dialog = dialogRef.current
      if (e.key !== 'Tab' || !dialog) return
      const focusables = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (!focusables.length) {
        e.preventDefault()
        dialog.focus()
        return
      }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement
      const inList = focusables.some(f => f === active)
      if (e.shiftKey && (active === first || !inList)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || !inList)) {
        e.preventDefault()
        first.focus()
      }
    }
    const onPointerDown = (e: Event) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        restoreFocus.current = false
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  const pick = (s: Suggestion) => {
    dispatch({ type: 'ADD_STEP', utilityId: s.step.utilityId, params: seededParams(s.step) })
    countEvent({ name: 'utility_add', utility: s.step.utilityId, source: 'magic' })
    closeDialog(true)
  }

  const decodeAll = async () => {
    const ctrl = new AbortController()
    decodeCtrl.current = ctrl
    setDecodingAll(true)
    setNotice(null)
    try {
      const result = await magic.decodeAll(ctrl.signal)
      if (ctrl.signal.aborted) return
      if (!result.steps.length) {
        setNotice('Nothing here decodes with enough confidence to chain automatically. Pick a suggestion instead.')
        return
      }
      dispatch({
        type: 'INSERT_STEPS',
        steps: result.steps.map(s => ({ id: '', utilityId: s.utilityId, params: seededParams(s), enabled: true })),
      })
      for (const s of result.steps) countEvent({ name: 'utility_add', utility: s.utilityId, source: 'decode_all' })
      closeDialog(true)
    } finally {
      if (decodeCtrl.current === ctrl) decodeCtrl.current = null
      setDecodingAll(false)
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        className="btn-ghost"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? closeDialog(true) : openDialog())}
      >
        <Wand2 size={14} className="text-acc" aria-hidden /> Magic
      </button>
      {open && (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className="absolute right-0 top-8 w-80 max-w-[calc(100vw-48px)] z-[25] grid gap-2.5 p-3 bg-surface border rounded-lg shadow-float outline-hidden"
          style={panelStyle ? { left: panelStyle.left, right: 'auto', width: panelStyle.width } : undefined}
        >
          <div className="flex items-center justify-between gap-2">
            <h2 id={titleId} className="m-0 text-[13.5px] font-semibold">Magic decode</h2>
            <button
              type="button"
              className="grid place-items-center size-6 rounded-[5px] text-muted hover:bg-surface-2 hover:text-fg"
              aria-label="close magic decode"
              onClick={() => closeDialog(true)}
            >
              <X size={14} aria-hidden />
            </button>
          </div>
          <p className="m-0 text-[12.5px] text-muted">
            {hasSteps
              ? 'Looks at the pipeline’s output and suggests a step to decode it.'
              : 'Looks at your input and suggests a first step.'}
          </p>
          {waiting ? (
            <p role="status" className="m-0 text-[12.5px] text-muted">
              {pending
                ? 'Waiting for the pipeline to finish…'
                : run.result
                  ? 'The output is out of date. Run the pipeline first, because magic reads its output.'
                  : 'Run the pipeline first. Magic reads its output.'}
            </p>
          ) : (
            <SuggestionList
              value={value}
              loading={magic.loading}
              error={magic.error}
              suggestions={magic.suggestions}
              onPick={pick}
              onDecodeAll={decodeAll}
              decodingAll={decodingAll}
            />
          )}
          {notice && <p role="status" className="m-0 text-[12.5px] text-warn">{notice}</p>}
        </div>
      )}
    </div>
  )
}
