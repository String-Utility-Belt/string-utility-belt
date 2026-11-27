import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToolProvider, useTool } from '@/app/ToolContext'
import type { PipelineStep } from '@/types/utility'
import GenerateDialog from './GenerateDialog'
import GenerateButton from './GenerateButton'
import { EVENT_OPEN_GENERATE } from '@/app/commands/commands'

const EXISTING: PipelineStep[] = [{ id: 'old', utilityId: 'url_decode', enabled: true, params: {} }]

const OK = {
  steps: [
    { id: 's1', utilityId: 'base64_decode', enabled: true, params: {} },
    { id: 's2', utilityId: 'json_pretty', enabled: true, params: { indent: 4 } },
  ],
  why: ['turns the base64 back into text', 'indents the JSON'],
  notes: 'Left out sort keys (unknown utility).',
  cached: false,
}

let fetchMock: ReturnType<typeof vi.fn>
const answer = (status: number, body: unknown, headers: Record<string, string> = {}) => {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  }))
}

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllGlobals() })

function Probe() {
  const { state, dispatch } = useTool()
  return (
    <>
      <div data-testid="ids">{state.steps.map(s => ('utilityId' in s ? s.utilityId : s.type)).join(',')}</div>
      <button type="button" onClick={() => dispatch({ type: 'UNDO' })}>probe undo</button>
    </>
  )
}

function Harness({ steps = EXISTING, onClose = () => {} }: { steps?: PipelineStep[]; onClose?: () => void }) {
  return (
    <ToolProvider initialSteps={steps} initialInput="">
      <Probe />
      <GenerateDialog onClose={onClose} />
    </ToolProvider>
  )
}

const ids = () => screen.getByTestId('ids').textContent

async function describeAndSubmit(text = 'decode base64 then pretty-print') {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('What should the pipeline do?'), text)
  await user.click(screen.getByRole('button', { name: 'Build steps' }))
  return user
}

describe('GenerateDialog', () => {
  it('sends only the description and lists each step with its reason and the notes', async () => {
    answer(200, OK)
    render(<Harness />)
    await describeAndSubmit()
    expect(await screen.findByText('base64 decode')).toBeInTheDocument()
    expect(screen.getByText(/turns the base64 back into text/)).toBeInTheDocument()
    expect(screen.getByText(/indents the JSON/)).toBeInTheDocument()
    expect(screen.getByText('Left out sort keys (unknown utility).')).toBeInTheDocument()
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual({ description: 'decode base64 then pretty-print' })
  })

  it('replaces the pipeline in one undoable step and closes', async () => {
    answer(200, OK)
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    const user = await describeAndSubmit()
    await user.click(await screen.findByRole('button', { name: 'Replace pipeline' }))
    expect(ids()).toBe('base64_decode,json_pretty')
    expect(onClose).toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'probe undo' }))
    expect(ids()).toBe('url_decode')
  })

  it('adds the steps to the end in one undoable step', async () => {
    answer(200, OK)
    render(<Harness />)
    const user = await describeAndSubmit()
    await user.click(await screen.findByRole('button', { name: 'Add to the end' }))
    expect(ids()).toBe('url_decode,base64_decode,json_pretty')
    await user.click(screen.getByRole('button', { name: 'probe undo' }))
    expect(ids()).toBe('url_decode')
  })

  it('offers only "Use these steps" when the pipeline is empty', async () => {
    answer(200, OK)
    render(<Harness steps={[]} />)
    const user = await describeAndSubmit()
    const use = await screen.findByRole('button', { name: 'Use these steps' })
    expect(screen.queryByRole('button', { name: 'Add to the end' })).toBeNull()
    await user.click(use)
    expect(ids()).toBe('base64_decode,json_pretty')
  })

  it.each([
    [503, { code: 'ai_off' }, {}, /not switched on/, true],
    [503, { code: 'ai_budget' }, {}, /used up today’s budget/, true],
    [429, { code: 'ai_rate' }, { 'retry-after': '20' }, /Try again in 20 s/, true],
    [429, { code: 'ai_rate' }, { 'retry-after': '43200' }, /all the AI pipelines for today/, true],
    [400, { code: 'ai_invalid' }, {}, /at most 500 characters/, false],
    [422, { code: 'ai_unusable', notes: 'Left out custom js.' }, {}, /No usable steps/, true],
    [502, { code: 'ai_upstream' }, {}, /could not be reached. Try again in a minute/, true],
  ])('shows its own message for %s %j', async (status, body, headers, message, fallback) => {
    answer(status, { error: 'server text', ...body }, headers)
    render(<Harness />)
    await describeAndSubmit()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(message)
    if ('notes' in body) expect(alert).toHaveTextContent('Left out custom js.')
    const search = screen.queryByRole('link', { name: 'search the utilities' })
    if (fallback) {
      expect(search).toHaveAttribute('href', '/utilities/')
      expect(screen.getByRole('link', { name: /MCP server/ })).toHaveAttribute('href', '/integrations/#mcp-server-for-ai-agents')
    } else {
      expect(search).toBeNull()
    }
    expect(ids()).toBe('url_decode')
  })

  it('says it could not reach the builder when there is no Worker (a dev server page)', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html' } }))
    render(<Harness />)
    await describeAndSubmit()
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be reached. Check your connection/)
  })

  it('keeps the button off for an empty description and caps it at 500 characters', () => {
    render(<Harness />)
    expect(screen.getByRole('button', { name: 'Build steps' })).toBeDisabled()
    expect(screen.getByLabelText('What should the pipeline do?')).toHaveAttribute('maxLength', '500')
    expect(screen.getByRole('link', { name: 'What is kept' })).toHaveAttribute('href', '/privacy/#features-that-contact-our-server')
  })
})

describe('GenerateButton', () => {
  it('opens the dialog on click and on the command palette event', async () => {
    const user = userEvent.setup()
    render(<ToolProvider initialSteps={[]} initialInput=""><GenerateButton /></ToolProvider>)
    await user.click(screen.getByRole('button', { name: /Describe it/ }))
    expect(await screen.findByRole('dialog', { name: 'Describe a pipeline' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'close dialog' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    window.dispatchEvent(new CustomEvent(EVENT_OPEN_GENERATE))
    expect(await screen.findByRole('dialog', { name: 'Describe a pipeline' })).toBeInTheDocument()
  })
})
