import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { runPipeline } from '@/core/runner'
import { staticRegistry } from '@/utilities/static-registry'
import { loadState } from '@/lib/persist'
import { tracePreset, TRACE_ELEMENT_ID, type PresetTrace } from '@/presets/trace'
import preset from '@/presets/excel-column-to-sql-in-clause/preset'
import { execute } from '@/app/engine/executor'
import { toPipelineSteps } from '@/presets/types'
import { STEP_TYPES } from '@/core/steps'
import { __resetExtensionBridgeForTests } from '@/app/extension/bridge'
import { installFakeExtension } from '@/app/extension/fakeExtension'
import * as openInEditor from './openInEditor'
import { countEvent } from '@/app/events/countEvent'
import PresetPage from './PresetPage'

vi.mock('@/app/events/countEvent', () => ({ countEvent: vi.fn() }))
vi.mock('@/app/engine/executor', async importOriginal => {
  const mod = await importOriginal<typeof import('@/app/engine/executor')>()
  return { ...mod, execute: vi.fn(mod.execute) }
})

const SLUG = preset.slug
const [main, second] = preset.samples
const output = () => screen.getByRole('status', { name: 'Output' })
const input = () => screen.getByRole('textbox', { name: 'preset input' }) as HTMLTextAreaElement

async function buildTrace(): Promise<PresetTrace> {
  return tracePreset(preset, (i, s, previews) => runPipeline(i, s, { load: staticRegistry.load, previews, env: 'node' }))
}

function embed(trace: unknown) {
  const script = document.createElement('script')
  script.type = 'application/json'
  script.id = TRACE_ELEMENT_ID
  script.textContent = JSON.stringify(trace)
  document.head.appendChild(script)
}

beforeEach(() => { vi.mocked(execute).mockClear(); vi.mocked(countEvent).mockClear() })
afterEach(() => {
  document.getElementById(TRACE_ELEMENT_ID)?.remove()
  document.querySelector('meta[name="robots"]')?.remove()
  localStorage.clear()
  sessionStorage.clear()
  history.replaceState(null, '', '/')
})

describe('PresetPage', () => {
  it('loads the preset and runs its first example live: output, every step, and what skipping each does', async () => {
    render(<PresetPage slug={SLUG} />)
    expect(await screen.findByRole('heading', { level: 1, name: preset.name })).toBeTruthy()
    expect(input().value).toBe(main.input)
    await waitFor(() => expect(output().textContent).toBe(main.output))
    const steps = screen.getByRole('heading', { name: 'Step by step' }).closest('section')!
    expect(within(steps).getAllByRole('heading', { level: 3 })).toHaveLength(preset.steps.length)
    expect(within(steps).getAllByText('Output after this step', { exact: false })).toHaveLength(preset.steps.length)
    const skip = screen.getByRole('heading', { name: 'What if you skip a step?' }).closest('section')!
    await waitFor(() => expect(within(skip).getAllByRole('heading', { level: 3 })).toHaveLength(preset.steps.length))
  })

  it('stops working out the skip traces once the page is left', async () => {
    const real = await vi.importActual<typeof import('@/app/engine/executor')>('@/app/engine/executor')
    // slow runs, so the page is left while the trace (a main run, then one per left-out step) is under way
    vi.mocked(execute).mockImplementation(async (...args) => {
      await new Promise(resolve => setTimeout(resolve, 30))
      return real.execute(...args)
    })
    try {
      const { unmount } = render(<PresetPage slug={SLUG} />)
      await waitFor(() => expect(execute).toHaveBeenCalled())
      unmount()
      const started = vi.mocked(execute).mock.calls.length
      await new Promise(resolve => setTimeout(resolve, 30 * (preset.steps.length + 2)))
      expect(vi.mocked(execute).mock.calls.length).toBe(started)
    } finally {
      vi.mocked(execute).mockReset()
      vi.mocked(execute).mockImplementation(real.execute)
    }
  })

  it("sets the guide's search title and description", async () => {
    render(<PresetPage slug={SLUG} />)
    await screen.findByRole('heading', { level: 1, name: preset.name })
    expect(document.title).toMatch(/^Excel Column to SQL IN Clause/)
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toMatch(/^Convert a column to a comma separated list with single quotes/)
  })

  it("starts from the build's embedded trace without running anything, and runs once the input changes", async () => {
    embed(await buildTrace())
    render(<PresetPage slug={SLUG} />)
    await screen.findByRole('heading', { level: 1, name: preset.name })
    expect(output().textContent).toBe(main.output)
    expect(screen.queryByText('Working it out…')).toBeNull()
    expect(execute).not.toHaveBeenCalled()

    fireEvent.change(input(), { target: { value: "x\nx\ny'z\n" } })
    await waitFor(() => expect(output().textContent).toBe("IN ('x', 'y''z')"))
    expect(execute).toHaveBeenCalled()
  })

  it('ignores an embedded trace that does not match this preset (another preset, or an older build)', async () => {
    const trace = await buildTrace()
    embed({ ...trace, steps: trace.steps.slice(1) })
    render(<PresetPage slug={SLUG} />)
    await screen.findByRole('heading', { level: 1, name: preset.name })
    await waitFor(() => expect(execute).toHaveBeenCalled())
    await waitFor(() => expect(output().textContent).toBe(main.output))
  })

  it('switches to another example and runs it', async () => {
    render(<PresetPage slug={SLUG} />)
    fireEvent.click(await screen.findByRole('button', { name: second.title }))
    expect(screen.getByRole('button', { name: second.title }).getAttribute('aria-pressed')).toBe('true')
    // a textarea reports CRLF as LF; the run itself uses the example's exact text
    expect(input().value).toBe(second.input.replace(/\r\n/g, '\n'))
    await waitFor(() => expect(output().textContent).toBe(second.output))
  })

  it('holds back a very large input instead of showing an earlier result next to it, until asked to run it', async () => {
    render(<PresetPage slug={SLUG} />)
    await waitFor(() => expect(output().textContent).toBe(main.output))
    const big = 'a@example.com\n'.repeat(80_000) // 1.12 million characters: over the live-run size guard
    fireEvent.change(input(), { target: { value: big } })
    expect((await screen.findByText(/Large input \(1\.1 MB\): the live preview is paused\./)).textContent).toMatch(/paused/)
    expect(output().textContent).toBe('')
    fireEvent.click(screen.getByRole('button', { name: 'Run full input' }))
    await waitFor(() => expect(output().textContent).toBe("IN ('a@example.com')"))
    expect(screen.queryByRole('button', { name: 'Run full input' })).toBeNull()
  })

  it('brings an example back when it is clicked after the visitor typed their own text', async () => {
    render(<PresetPage slug={SLUG} />)
    await screen.findByRole('heading', { level: 1, name: preset.name })
    fireEvent.change(input(), { target: { value: 'mine' } })
    const chip = screen.getByRole('button', { name: main.title })
    expect(chip.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(chip)
    expect(chip.getAttribute('aria-pressed')).toBe('true')
    expect(input().value).toBe(main.input)
    await waitFor(() => expect(output().textContent).toBe(main.output))
  })

  it('clears the output when a run fails, rather than leaving an earlier result beside the error', async () => {
    render(<PresetPage slug={SLUG} />)
    await waitFor(() => expect(output().textContent).toBe(main.output))
    vi.mocked(execute).mockRejectedValue(new Error('worker crashed'))
    try {
      fireEvent.change(input(), { target: { value: 'x' } })
      expect((await screen.findByRole('alert')).textContent).toBe('The pipeline could not run: worker crashed')
      expect(output().textContent).toBe('')
    } finally {
      vi.mocked(execute).mockReset()
      const real = await vi.importActual<typeof import('@/app/engine/executor')>('@/app/engine/executor')
      vi.mocked(execute).mockImplementation(real.execute)
    }
  })

  it('reports a failing step in words, with its number and name', async () => {
    render(<PresetPage slug={SLUG} />)
    await screen.findByRole('heading', { level: 1, name: preset.name })
    vi.mocked(execute).mockImplementation(async (value, steps) => ({
      out: value, previews: {}, inputs: {}, err: { [steps[2].id]: 'boom' }, timings: {}, skipped: {}, halted: false, aborted: false, where: 'main',
    }))
    try {
      fireEvent.change(input(), { target: { value: 'x' } })
      expect((await screen.findByRole('alert')).textContent).toBe('Step 3 (quote each value) failed: boom')
    } finally {
      vi.mocked(execute).mockReset()
      const real = await vi.importActual<typeof import('@/app/engine/executor')>('@/app/engine/executor')
      vi.mocked(execute).mockImplementation(real.execute)
    }
  })

  it('opens the steps and the current input in the editor, saving the pipeline that was there', async () => {
    localStorage.setItem('string-utility-belt', JSON.stringify({ v: 2, steps: [{ id: 'm', utilityId: 'reverse', enabled: true, params: {} }], showPreviews: true }))
    history.replaceState(null, '', `/presets/${SLUG}/`)
    render(<PresetPage slug={SLUG} />)
    await screen.findByRole('heading', { level: 1, name: preset.name })
    fireEvent.change(input(), { target: { value: 'mine' } })
    const open = screen.getByRole('link', { name: 'Open in the editor' })
    expect(open.getAttribute('href')).toMatch(/^\/#\/p\//)
    // the link carries the example's input, never what the visitor typed
    expect(decodeURIComponent(open.getAttribute('href')!)).not.toContain('mine')
    fireEvent.click(open)

    expect(location.pathname).toBe('/')
    expect(loadState().steps.map(s => ('utilityId' in s ? s.utilityId : ''))).toEqual(preset.steps.map(s => ('utilityId' in s ? s.utilityId : '')))
    expect(loadState().name).toBe(preset.name)
    expect(sessionStorage.getItem('sub:handoff-input')).toBe('mine')
    expect(countEvent).toHaveBeenCalledWith({ name: 'preset_open', preset: SLUG, source: 'page' })
  })

  it('follows the share link instead when storage refuses the preset', async () => {
    history.replaceState(null, '', `/presets/${SLUG}/`)
    const follow = vi.spyOn(openInEditor, 'followLink').mockImplementation(() => {})
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('blocked', 'SecurityError') })
    try {
      render(<PresetPage slug={SLUG} />)
      await screen.findByRole('heading', { level: 1, name: preset.name })
      const open = screen.getByRole('link', { name: 'Open in the editor' })
      fireEvent.click(open)
      expect(follow).toHaveBeenCalledWith(open.getAttribute('href'))
      expect(location.pathname).toBe(`/presets/${SLUG}/`)
      expect(countEvent).toHaveBeenCalledWith({ name: 'preset_open', preset: SLUG, source: 'page' })
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('leaves a modified click (new tab) to the browser', async () => {
    history.replaceState(null, '', `/presets/${SLUG}/`)
    render(<PresetPage slug={SLUG} />)
    await screen.findByRole('heading', { level: 1, name: preset.name })
    fireEvent.click(screen.getByRole('link', { name: 'Open in the editor' }), { ctrlKey: true })
    expect(location.pathname).toBe(`/presets/${SLUG}/`)
    expect(countEvent).not.toHaveBeenCalled()
  })

  it('copies the output', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<PresetPage slug={SLUG} />)
    await waitFor(() => expect(output().textContent).toBe(main.output))
    fireEvent.click(screen.getByRole('button', { name: 'Copy output' }))
    expect(writeText).toHaveBeenCalledWith(main.output)
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeTruthy()
  })

  it('offers to save the preset to the browser extension, under the preset\'s name, once it answers', async () => {
    __resetExtensionBridgeForTests()
    const fake = installFakeExtension({ stepTypes: [...STEP_TYPES] })
    try {
      render(<PresetPage slug={SLUG} />)
      const widget = (await screen.findByRole('heading', { name: 'Try it with your own data' })).closest('section')!
      fireEvent.click(await within(widget).findByRole('button', { name: 'Save to extension' }))
      await waitFor(() => expect(fake.sent.some(s => s.message.type === 'request')).toBe(true))
      expect(fake.sent.find(s => s.message.type === 'request')!.message.request)
        .toEqual({ type: 'save-pipeline', name: preset.name, steps: toPipelineSteps(preset.steps) })
    } finally {
      vi.unstubAllGlobals()
      __resetExtensionBridgeForTests()
    }
  })

  it('answers an unknown slug with a not-found page kept out of search indexes', async () => {
    render(<PresetPage slug="no-such-preset" />)
    expect(await screen.findByRole('heading', { level: 1, name: 'No preset at this address' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Browse all presets' }).getAttribute('href')).toBe('/presets/')
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex')
  })
})
