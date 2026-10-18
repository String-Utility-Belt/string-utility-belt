import React from 'react'
import { useTool } from '@/app/ToolContext'
import { countEvent } from '@/app/events/countEvent'
import { isBytes } from '@/core/coerce'
import type { Suggestion } from '@/core/detect'
import { seededParams } from '@/app/magic/seed'
import SuggestionPill from './steps/SuggestionPill'
import { useDecodeSuggestions } from './steps/useDecodeSuggestions'

const MAX_SUGGESTIONS = 3

/**
 * Shown by `StepsSection` in place of the step list while the pipeline has no steps:
 * what the input looks like it could be, as first steps to add with one click. The
 * add buttons and presets link follow it in the section's add row.
 */
export default function EmptyState() {
  const { input, dispatch } = useTool()
  const { empty, tooLarge, suggestions } = useDecodeSuggestions(input, { limit: MAX_SUGGESTIONS })
  const n = suggestions?.length ?? 0

  const pick = (s: Suggestion) => {
    dispatch({ type: 'ADD_STEP', utilityId: s.step.utilityId, params: seededParams(s.step) })
    countEvent({ name: 'utility_add', utility: s.step.utilityId, source: 'suggestion' })
  }

  let status: React.ReactNode
  if (empty) status = 'Paste something and we’ll suggest a pipeline.'
  else if (tooLarge) status = 'This input is too large to analyse automatically. Add a step, or try Magic.'
  else if (!suggestions) status = 'Looking for a pipeline that fits…'
  else if (n > 0) {
    status = (
      <>
        {isBytes(input) ? 'A binary file. Here is what it could be:' : 'A few things this could be:'}
        <span className="sr-only"> {n} suggestion{n === 1 ? '' : 's'}</span>
      </>
    )
  } else status = 'No obvious decoding for this input. Add a step or start from a preset.'

  return (
    <div className="grid grid-cols-[32px_minmax(0,1fr)] gap-x-3">
      <div className="flex flex-col items-center" aria-hidden="true">
        <span className="flex-1 w-px min-h-3 bg-line-2" />
      </div>
      <div className="grid gap-3 mb-3 px-[18px] pt-[18px] pb-4 border border-dashed border-line-2 rounded-lg">
        <p role="status" aria-live="polite" className="m-0 text-[13.5px]">{status}</p>
        {n > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="suggested first steps">
            {suggestions!.map((s, i) => (
              <li key={`${s.step.utilityId}:${i}`} className="min-w-0">
                <SuggestionPill suggestion={s} onPick={pick} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
