/**
 * The tool page's steps column: the steps toolbar, the step list (or the empty state),
 * and the add row (add step, branch, run on each, a suggested next step, quick add,
 * presets) with the inline utility picker under it. Mounts the top-level selection
 * provider, so the toolbar's Select toggle and the list share one selection.
 */
import React, { useMemo, useRef, useState } from 'react'
import { GitFork, Plus, Repeat } from 'lucide-react'
import type { ValueType } from '@/types/utility'
import type { Suggestion } from '@/core/detect'
import { defaultParams } from '@/core/params'
import { typesOf, valueType } from '@/core/coerce'
import { isUtilityStep } from '@/core/steps'
import { registry } from '@/app/registry'
import { utilityOptionGroups } from '@/app/utilityOptions'
import { useTool } from '@/app/ToolContext'
import { countEvent } from '@/app/events/countEvent'
import EngineControls from '@/app/engine/EngineControls'
import MagicButton from '@/app/magic/MagicButton'
import { seededParams } from '@/app/magic/seed'
import Select from '@/components/Select'
import UtilityPicker from '@/components/UtilityPicker'
import { suggestUtility } from '@/app/feedback/open'
import EmptyState from '../EmptyState'
import PipelineToolbar from '../PipelineToolbar'
import StepList from '../StepList'
import BulkToggle from './BulkToggle'
import { SelectionProvider } from './SelectionContext'
import SuggestionPill from './SuggestionPill'
import { useDecodeSuggestions } from './useDecodeSuggestions'

/** The "Branch" / "Run on each" buttons. */
const ADD_BUTTON = 'btn h-[30px] px-2.5'

export default function StepsSection() {
  const { state, dispatch, input, run, liveRun } = useTool()
  const [showPicker, setShowPicker] = useState(false)
  // whichever control opened the picker gets focus back when it closes
  const opener = useRef<HTMLElement | null>(null)
  const hasSteps = state.steps.length > 0
  const quickOptions = useMemo(() => [{ label: 'Quick add…', value: '' }, ...utilityOptionGroups()], [])

  const openPicker = () => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setShowPicker(true)
  }
  const closePicker = () => {
    setShowPicker(false)
    // after the picker (and its focused search box) unmounts
    requestAnimationFrame(() => opener.current?.focus())
  }
  const addStep = (id: string, source: 'picker' | 'quick_add') => {
    dispatch({ type: 'ADD_STEP', utilityId: id, params: defaultParams(registry.get(id)) })
    countEvent({ name: 'utility_add', utility: id, source })
  }

  // What a step appended at the end will receive — the pipeline's actual output type
  // when a run has finished, else the last enabled utility's declared output, else
  // the input's type. Drives the picker's compatibility badges.
  const previousProduces = useMemo<ValueType[]>(() => {
    if (hasSteps && run.result) return [valueType(run.result.out)]
    const last = [...state.steps].reverse().find(s => isUtilityStep(s) && s.enabled !== false)
    const meta = last && isUtilityStep(last) ? registry.get(last.utilityId) : undefined
    return meta ? typesOf(meta.produces) : [valueType(input)]
  }, [hasSteps, state.steps, input, run.result])

  // a decoder for the pipeline's current output, offered as the next step: only for a
  // finished, complete live result, which is what an appended step would actually see
  const settled = hasSteps && liveRun && !!run.result && !run.running && !run.partial
  const { suggestions } = useDecodeSuggestions(run.result?.out ?? '', { limit: 1, enabled: settled })
  const next = settled ? suggestions?.[0] : undefined
  const pickNext = (s: Suggestion) => {
    dispatch({ type: 'ADD_STEP', utilityId: s.step.utilityId, params: seededParams(s.step) })
    countEvent({ name: 'utility_add', utility: s.step.utilityId, source: 'next_step' })
  }

  return (
    <SelectionProvider>
      <section className="grid min-w-0" aria-label="Pipeline steps">
        <PipelineToolbar trailing={<EngineControls />}>
          <MagicButton />
          <BulkToggle />
        </PipelineToolbar>

        {hasSteps ? <StepList steps={state.steps} /> : <EmptyState />}

        <div className="grid grid-cols-[32px_minmax(0,1fr)] gap-x-3">
          <div className="flex justify-center" aria-hidden="true">
            <span className="size-7 grid place-items-center rounded-md border border-dashed border-line-2 text-muted"><Plus size={14} /></span>
          </div>
          <div className="grid gap-2.5 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 min-h-7">
              <button type="button" className="cta h-[30px] px-3" aria-expanded={showPicker}
                onClick={() => (showPicker ? closePicker() : openPicker())}>
                Add step
              </button>
              <button type="button" className={ADD_BUTTON} title="Fork the pipeline into parallel lanes"
                onClick={() => dispatch({ type: 'ADD_BRANCH' })}>
                <GitFork size={14} aria-hidden="true" /> Branch
              </button>
              <button type="button" className={ADD_BUTTON} title="Run steps on each line, list item or JSON value on its own"
                onClick={() => dispatch({ type: 'ADD_EACH' })}>
                <Repeat size={14} aria-hidden="true" /> Run on each
              </button>
              {next && <SuggestionPill suggestion={next} onPick={pickNext} hint />}
              {!hasSteps && (
                <button type="button" className="h-[30px] px-1.5 text-[12.5px] text-muted underline underline-offset-[3px] hover:text-fg"
                  onClick={() => window.dispatchEvent(new CustomEvent('sub:open-presets'))}>
                  or start from a preset
                </button>
              )}
              <Select value="" aria-label="quick add a utility" options={quickOptions}
                className="h-[30px] w-44 sm:ml-auto text-[12.5px] text-muted"
                onChange={id => { if (id) addStep(id, 'quick_add') }} />
            </div>
            {showPicker && (
              <UtilityPicker previousProduces={previousProduces} onClose={closePicker} onSuggest={suggestUtility}
                onPick={id => { addStep(id, 'picker'); closePicker() }} />
            )}
          </div>
        </div>
      </section>
    </SelectionProvider>
  )
}
