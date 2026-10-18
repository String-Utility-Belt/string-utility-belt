/**
 * `editor_run`: counted at most once per page load, the first time the editor shows a
 * result the visitor asked for. They changed the steps or the input since the editor
 * opened (a saved pipeline re-running on load, or a shared link running itself, is not a
 * use) or ran a pipeline that was held back until they clicked Run; the pipeline had
 * something to work on or produced something (a generator needs no input); and the result
 * stood for RUN_SETTLE_MS instead of flashing past while they typed.
 */
import { useEffect, useRef } from 'react'
import type { PipelineStep, Value } from '@/types/utility'
import { isEmptyValue } from '@/core/coerce'
import { countSteps } from '@/core/steps'
import { RUN_SOURCES, stepBucket } from '@/lib/countedEvents'
import { countEvent } from './countEvent'

export const RUN_SETTLE_MS = 2000

export type RunSource = (typeof RUN_SOURCES)[number]

export interface EditorRunState {
  steps: PipelineStep[]
  input: Value
  /** The latest completed run's output, or undefined before the first one. */
  out: Value | undefined
  running: boolean
  /** The pipeline waits for an explicit Run (`ToolApi.runHeld`). */
  held: boolean
}

// module scope: once per page load, however often the editor remounts
let counted = false

/** For tests: forget that this page load already counted a run. */
export function resetEditorRunCount(): void {
  counted = false
}

export function useEditorRunCount(source: RunSource, { steps, input, out, running, held }: EditorRunState): void {
  const initial = useRef({ steps, input, held })
  useEffect(() => {
    if (counted || out === undefined || running) return
    const n = countSteps(steps)
    if (n === 0) return
    const start = initial.current
    if (steps === start.steps && input === start.input && !(start.held && !held)) return
    if (isEmptyValue(input) && isEmptyValue(out)) return
    const timer = setTimeout(() => {
      if (counted) return
      counted = true
      countEvent({ name: 'editor_run', source, steps: stepBucket(n) })
    }, RUN_SETTLE_MS)
    return () => clearTimeout(timer)
  }, [source, steps, input, out, running, held])
}
