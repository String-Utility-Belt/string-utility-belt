import React from 'react'
import { describe, expect, it } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FeedbackHost from './FeedbackHost'
import { openFeedback, suggestUtility } from './open'

describe('FeedbackHost', () => {
  it('opens the form in a dialog, focused on the message, and closes it', async () => {
    const user = userEvent.setup()
    render(<FeedbackHost />)
    expect(screen.queryByRole('dialog')).toBeNull()
    act(() => openFeedback())
    const dialog = await screen.findByRole('dialog', { name: 'Feedback and suggestions' })
    expect(screen.getByRole('textbox', { name: 'Your message' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(dialog).not.toBeInTheDocument()
  })

  it('starts a utility suggestion with what was searched for', async () => {
    render(<FeedbackHost />)
    act(() => suggestUtility('  csv to markdown '))
    await screen.findByRole('dialog')
    expect(screen.getByRole('button', { name: 'Suggest a utility' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('textbox', { name: 'Your message' }))
      .toHaveValue('I searched for “csv to markdown” and would like a utility that ')
  })

  it('cuts a very long search to 200 characters, never splitting one', async () => {
    render(<FeedbackHost />)
    act(() => suggestUtility('😀'.repeat(300)))
    await screen.findByRole('dialog')
    expect(screen.getByRole('textbox', { name: 'Your message' }))
      .toHaveValue(`I searched for “${'😀'.repeat(200)}” and would like a utility that `)
  })

  it('keeps the draft when asked to open again while open', async () => {
    const user = userEvent.setup()
    render(<FeedbackHost />)
    act(() => openFeedback())
    await user.type(await screen.findByRole('textbox', { name: 'Your message' }), 'half a thought')
    act(() => suggestUtility('yaml'))
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByRole('textbox', { name: 'Your message' })).toHaveValue('half a thought')
  })
})
