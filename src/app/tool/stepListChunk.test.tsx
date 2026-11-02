import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { ToolProvider } from '@/app/ToolContext'
import { saveState } from '@/lib/persist'
import type { Route } from '@/lib/router'
import StepsSection from './steps/StepsSection'
import { preloadStepListFor } from './stepListChunk'

// what loads the chunk, and when: the chunk itself is a stub here
const preload = vi.hoisted(() => vi.fn(() => Promise.resolve()))
vi.mock('@/app/preloadable', () => ({
  preloadable: () => Object.assign(() => <div>step list</div>, { preload }),
}))

const route = (name: Route['name']): Route => ({ name, params: {} })

afterEach(() => {
  preload.mockClear()
  localStorage.clear()
})

describe('preloadStepListFor', () => {
  it('loads the step list when the tool opens on steps: a shared pipeline, or a saved one on the home or not-found page', () => {
    preloadStepListFor(route('pipeline'))
    expect(preload).toHaveBeenCalledTimes(1)
    saveState({ steps: [{ id: 's1', utilityId: 'trim', enabled: true, params: {} }] })
    preloadStepListFor(route('home'))
    preloadStepListFor(route('notFound'))
    expect(preload).toHaveBeenCalledTimes(3)
  })

  it('leaves it for later on an empty pipeline, and on pages without the tool', async () => {
    await expect(preloadStepListFor(route('home'))).resolves.toBeUndefined()
    saveState({ steps: [{ id: 's1', utilityId: 'trim', enabled: true, params: {} }] })
    for (const name of ['utility', 'utilities', 'docs', 'blogPost', 'preset', 'embed'] as const) preloadStepListFor(route(name))
    expect(preload).not.toHaveBeenCalled()
  })
})

describe('StepsSection with no steps', () => {
  it('fetches the step list on the first pointer or key press only', () => {
    render(<ToolProvider persist={false}><StepsSection /></ToolProvider>)
    expect(preload).not.toHaveBeenCalled()
    fireEvent.pointerDown(document.body)
    fireEvent.keyDown(document.body, { key: 'a' })
    fireEvent.pointerDown(document.body)
    expect(preload).toHaveBeenCalledTimes(1)
  })
})
