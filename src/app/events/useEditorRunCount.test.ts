import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { PipelineStep } from '@/types/utility'
import { countEvent } from './countEvent'
import { RUN_SETTLE_MS, resetEditorRunCount, useEditorRunCount, type EditorRunState, type RunSource } from './useEditorRunCount'

vi.mock('./countEvent', () => ({ countEvent: vi.fn() }))

const step = (utilityId: string): PipelineStep => ({ id: utilityId, utilityId, params: {}, enabled: true })
const ONE = [step('base64_decode')]
const TWO = [step('base64_decode'), step('json_format')]

function setup(initial: EditorRunState, source: RunSource = 'editor') {
  return renderHook((s: EditorRunState) => useEditorRunCount(source, s), { initialProps: initial })
}

beforeEach(() => {
  vi.useFakeTimers()
  resetEditorRunCount()
})
afterEach(() => {
  vi.useRealTimers()
  vi.mocked(countEvent).mockClear()
})

describe('useEditorRunCount', () => {
  it('counts a run once its result has stood, after the visitor changed the input', () => {
    const { rerender } = setup({ steps: ONE, input: '', out: '', running: false, held: false })
    rerender({ steps: ONE, input: 'aGk=', out: 'hi', running: false, held: false })
    vi.advanceTimersByTime(RUN_SETTLE_MS - 1)
    expect(countEvent).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(countEvent).toHaveBeenCalledWith({ name: 'editor_run', source: 'editor', steps: '1' })
  })

  it('does not count a saved or shared pipeline re-running by itself on load', () => {
    const { rerender } = setup({ steps: TWO, input: 'aGk=', out: undefined, running: true, held: false }, 'share')
    rerender({ steps: TWO, input: 'aGk=', out: 'hi', running: false, held: false })
    vi.advanceTimersByTime(RUN_SETTLE_MS * 2)
    expect(countEvent).not.toHaveBeenCalled()
  })

  it('counts a held pipeline the visitor ran, with its source and size', () => {
    const { rerender } = setup({ steps: TWO, input: 'aGk=', out: undefined, running: false, held: true }, 'share')
    rerender({ steps: TWO, input: 'aGk=', out: 'hi', running: false, held: false })
    vi.advanceTimersByTime(RUN_SETTLE_MS)
    expect(countEvent).toHaveBeenCalledWith({ name: 'editor_run', source: 'share', steps: '2-3' })
  })

  it('waits while the visitor keeps typing, and counts the page load once', () => {
    const { rerender } = setup({ steps: ONE, input: '', out: '', running: false, held: false })
    for (const input of ['a', 'aG', 'aGk', 'aGk=']) {
      rerender({ steps: ONE, input, out: input, running: false, held: false })
      vi.advanceTimersByTime(RUN_SETTLE_MS / 2)
    }
    expect(countEvent).not.toHaveBeenCalled()
    vi.advanceTimersByTime(RUN_SETTLE_MS)
    rerender({ steps: TWO, input: 'aGk=', out: '"hi"', running: false, held: false })
    vi.advanceTimersByTime(RUN_SETTLE_MS)
    expect(countEvent).toHaveBeenCalledTimes(1)
  })

  it('does not count an empty pipeline, nothing in and nothing out, or a run still going', () => {
    const { rerender } = setup({ steps: [], input: '', out: '', running: false, held: false })
    rerender({ steps: [], input: 'text', out: 'text', running: false, held: false })
    vi.advanceTimersByTime(RUN_SETTLE_MS)
    rerender({ steps: ONE, input: '', out: '', running: false, held: false })
    vi.advanceTimersByTime(RUN_SETTLE_MS)
    rerender({ steps: ONE, input: 'aGk=', out: '', running: true, held: false })
    vi.advanceTimersByTime(RUN_SETTLE_MS)
    expect(countEvent).not.toHaveBeenCalled()
  })

  it('counts a generator, which needs no input', () => {
    const { rerender } = setup({ steps: [], input: '', out: '', running: false, held: false })
    rerender({ steps: [step('uuid')], input: '', out: '0b6a3c1e-0000-4000-8000-000000000000', running: false, held: false })
    vi.advanceTimersByTime(RUN_SETTLE_MS)
    expect(countEvent).toHaveBeenCalledWith({ name: 'editor_run', source: 'editor', steps: '1' })
  })
})
