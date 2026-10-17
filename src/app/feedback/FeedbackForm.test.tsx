import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FEEDBACK_ADDRESS, type FeedbackRequest } from '@/lib/feedback'
import FeedbackForm from './FeedbackForm'
import type { SendResult } from './send'

const sender = (result: SendResult) => vi.fn<(request: FeedbackRequest) => Promise<SendResult>>(async () => result)

afterEach(() => { history.replaceState(null, '', '/') })

describe('FeedbackForm', () => {
  it('sends the chosen kind, the cleaned message, the reply address and the page path, never its fragment', async () => {
    history.replaceState(null, '', '/util/hex/#/p/N4Ig')
    const send = sender({ status: 'sent' })
    const user = userEvent.setup()
    render(<FeedbackForm send={send} />)
    await user.click(screen.getByRole('button', { name: 'Report a bug' }))
    expect(screen.getByRole('button', { name: 'Report a bug' })).toHaveAttribute('aria-pressed', 'true')
    await user.type(screen.getByRole('textbox', { name: 'Your message' }), '  The hex view freezes on big files.  ')
    await user.type(screen.getByRole('textbox', { name: 'Your email (optional)' }), 'ada@example.com')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    expect(send).toHaveBeenCalledWith({
      kind: 'bug', message: 'The hex view freezes on big files.', email: 'ada@example.com', page: '/util/hex/', website: '',
    })
    expect(await screen.findByRole('status')).toHaveTextContent('We’ll reply to ada@example.com')
    // focus moves to the next thing to do, not to <body>, in an effect after the send resolves
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send another message' })).toHaveFocus())
  })

  it('says what is wrong before sending, on the field, and focuses it', async () => {
    const send = sender({ status: 'sent' })
    const user = userEvent.setup()
    render(<FeedbackForm send={send} />)
    await user.type(screen.getByRole('textbox', { name: 'Your message' }), 'too short')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    const box = screen.getByRole('textbox', { name: 'Your message' })
    expect(box).toHaveAttribute('aria-invalid', 'true')
    expect(box).toHaveAccessibleDescription(expect.stringContaining('at least 10 characters'))
    expect(box).toHaveFocus()

    await user.type(box, ', but now it is long enough')
    await user.type(screen.getByRole('textbox', { name: 'Your email (optional)' }), 'not an address')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    expect(screen.getByRole('textbox', { name: 'Your email (optional)' })).toHaveFocus()
    expect(send).not.toHaveBeenCalled()
  })

  it('offers the visitor’s email app, with the message written out, when it cannot be sent', async () => {
    history.replaceState(null, '', '/utilities/')
    const user = userEvent.setup()
    render(<FeedbackForm send={sender({ status: 'unavailable' })} />)
    await user.type(screen.getByRole('textbox', { name: 'Your message' }), 'CSV to a Markdown table, please')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    const alert = await screen.findByRole('alert')
    const mailto = new URL(screen.getByRole('link', { name: 'Open in your email app' }).getAttribute('href')!)
    expect(mailto.pathname).toBe(FEEDBACK_ADDRESS)
    expect(mailto.searchParams.get('subject')).toBe('Utility suggestion: CSV to a Markdown table, please')
    expect(mailto.searchParams.get('body')).toContain(`${location.origin}/utilities/`)
    expect(alert).toHaveTextContent('couldn’t send')
    // the draft is still there, to send again or copy
    expect(screen.getByRole('textbox', { name: 'Your message' })).toHaveValue('CSV to a Markdown table, please')
  })

  it('says when to try again after too many messages', async () => {
    const user = userEvent.setup()
    render(<FeedbackForm send={sender({ status: 'limited', retryAfter: 1500 })} />)
    await user.type(screen.getByRole('textbox', { name: 'Your message' }), 'Another idea for a utility')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Try again in about 25 minutes')
  })

  it('shows the Worker’s answer on the field it names', async () => {
    const user = userEvent.setup()
    render(<FeedbackForm send={sender({ status: 'invalid', field: 'email', error: 'That email address doesn’t look right.' })} />)
    await user.type(screen.getByRole('textbox', { name: 'Your message' }), 'A perfectly good message')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Your email (optional)' })).toHaveAttribute('aria-invalid', 'true'))
  })

  it('starts from the text it was opened with, the caret after it', () => {
    render(<FeedbackForm initialKind="bug" initialMessage="I searched for “csv” " send={sender({ status: 'sent' })} />)
    const box = screen.getByRole('textbox', { name: 'Your message' }) as HTMLTextAreaElement
    expect(box.value).toBe('I searched for “csv” ')
    expect([box.selectionStart, box.selectionEnd]).toEqual([box.value.length, box.value.length])
    expect(screen.getByRole('button', { name: 'Report a bug' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('keeps the hidden bot trap out of reach and passes on what a bot typed into it', async () => {
    const send = sender({ status: 'sent' })
    const user = userEvent.setup()
    const { container } = render(<FeedbackForm send={send} />)
    const trap = container.querySelector<HTMLInputElement>('input[data-feedback-trap]')!
    // nothing autofill or a password manager would fill in for a real visitor
    expect([trap.name, trap.labels?.[0]?.textContent]).toEqual(['', 'Leave this empty '])
    expect(trap.tabIndex).toBe(-1)
    expect(trap.closest('[aria-hidden="true"]')).not.toBeNull()
    trap.value = 'https://spam.example'
    await user.type(screen.getByRole('textbox', { name: 'Your message' }), 'Buy cheap things here now')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ website: 'https://spam.example' }))
  })
})
