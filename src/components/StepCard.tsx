import React, { useRef, useState } from 'react'
import { ChevronsUpDown } from 'lucide-react'
import { valueType } from '@/core/coerce'
import type { UtilityStep, Value } from '@/types/utility'
import { registry } from '@/app/registry'
import { utilityPath } from '@/app/pages/related'
import { useOptionalTool } from '@/app/ToolContext'
import AdvancedSection from '@/app/tool/steps/AdvancedSection'
import OutputStrip from '@/app/tool/steps/OutputStrip'
import StepFrame from '@/app/tool/steps/StepFrame'
import StepStateChips from '@/app/tool/steps/StepStateChips'
import { useStepDepth } from '@/app/tool/steps/depth'
import { signatureOf, typeLabel } from '@/app/tool/steps/status'
import { suggestUtility } from '@/app/feedback/open'
import ParamsEditor from './ParamsEditor'
import UtilityPicker from './UtilityPicker'

export interface StepCardProps {
  index: number
  step: UtilityStep
  total: number
  onMoveUp: () => void
  onMoveDown: () => void
  onDelete: () => void
  onToggle: (enabled: boolean) => void
  onChangeParams: (params: Record<string, unknown>) => void
  onChangeUtil: (utilityId: string) => void
  /** This step's output from the last run (when previews are on). */
  preview?: Value
  /** This step's input from the last run (when previews are on). */
  input?: Value
  error?: string
  /** Milliseconds spent in this step's apply(). */
  ms?: number
  skipped?: string
  /** Extra content rendered under the params (feature slots). */
  children?: React.ReactNode
  /**
   * Handlers for the "more" menu and the advanced section. Each falls back to
   * dispatching on `useOptionalTool()` when omitted, so a card rendered inside a
   * `<ToolProvider>` works with no extra wiring; a standalone card (tests, docs)
   * without either just renders the controls inertly.
   */
  onDuplicate?: () => void
  onSolo?: () => void
  onRename?: (label: string) => void
  onUpdateStep?: (patch: Record<string, unknown>) => void
}

export default function StepCard({
  index, step, total, onMoveUp, onMoveDown, onDelete, onToggle, onChangeParams, onChangeUtil,
  preview, input, error, ms, skipped, children,
  onDuplicate, onSolo, onRename, onUpdateStep,
}: StepCardProps) {
  const meta = registry.get(step.utilityId)
  const tool = useOptionalTool()
  const nested = useStepDepth() > 0
  const enabled = step.enabled !== false
  const [picking, setPicking] = useState(false)
  const nameRef = useRef<HTMLButtonElement>(null)

  const updateStep = onUpdateStep
    ?? ((patch: Record<string, unknown>) => tool?.dispatch({ type: 'UPDATE_STEP', id: step.id, patch }))
  const duplicate = onDuplicate ?? (() => tool?.dispatch({ type: 'DUPLICATE_STEP', id: step.id }))
  const solo = onSolo ?? (() => tool?.dispatch({ type: 'SOLO_STEP', id: step.id }))
  const rename = onRename
    ?? ((label: string) => tool?.dispatch({ type: 'UPDATE_STEP', id: step.id, patch: { label: label.trim() || undefined } }))

  const utilityName = meta?.name ?? step.utilityId
  const category = meta?.category ?? 'unknown'
  const closePicker = () => {
    setPicking(false)
    nameRef.current?.focus()
  }

  return (
    <StepFrame
      stepId={step.id} index={index} total={total} enabled={enabled}
      title={
        <button ref={nameRef} type="button" aria-expanded={picking} aria-label={`${step.label || utilityName}, change utility`}
          title="Change utility" onClick={() => setPicking(p => !p)}
          className={`inline-flex items-center gap-[5px] min-w-0 text-left font-semibold tracking-[-0.005em] hover:text-acc ${nested ? 'text-[13px]' : 'text-[14.5px]'}`}>
          <span className="wrap-anywhere">{step.label || utilityName}</span>
          <ChevronsUpDown size={12} className="shrink-0 text-muted" aria-hidden="true" />
        </button>
      }
      sub={step.label ? `${utilityName} · ${category}` : category}
      chips={
        <>
          {preview !== undefined && <span className="chip">{typeLabel(valueType(preview))}</span>}
          <StepStateChips condition={step.condition} onError={step.onError} />
        </>
      }
      description={meta
        ? (
          <>
            {meta.description}{' '}
            <a href={utilityPath(meta.id)} aria-label={`${meta.name} docs`}
              className="text-muted underline decoration-line-2 underline-offset-2 hover:text-acc">Docs</a>
          </>
        )
        : `Unknown utility “${step.utilityId}”`}
      signature={meta ? signatureOf(meta) : undefined}
      ms={ms} error={error} onError={step.onError} skipped={skipped}
      onToggle={onToggle} onDelete={onDelete}
      menu={{
        label: step.label, onDuplicate: duplicate, onSolo: solo, onRename: rename, onMoveUp, onMoveDown,
        onChangeUtility: () => setPicking(true),
      }}
      output={preview !== undefined && <OutputStrip label="Output" value={preview} input={input} />}
    >
      {picking && (
        <div className="px-3.5 pb-3">
          <UtilityPicker title={`Pick a new utility for step ${index + 1}`} onClose={closePicker} onSuggest={suggestUtility}
            previousProduces={input !== undefined ? [valueType(input)] : undefined}
            onPick={id => { closePicker(); if (id !== step.utilityId) onChangeUtil(id) }} />
        </div>
      )}
      {meta && Object.keys(meta.params).length > 0 && (
        <div className={nested ? 'px-2.5 pb-2' : 'px-3.5 pb-3'}>
          <ParamsEditor spec={meta.params} params={step.params ?? {}} onChange={onChangeParams} />
        </div>
      )}
      {/* feature slots (the custom-code notice) may render nothing: the wrapper then hides */}
      {children && <div className="px-3.5 pb-3 empty:hidden">{children}</div>}
      <AdvancedSection condition={step.condition} onError={step.onError} onUpdate={updateStep} />
    </StepFrame>
  )
}
