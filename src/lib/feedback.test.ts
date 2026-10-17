import { describe, expect, it } from 'vitest'
import { checkFeedback, cleanMessage, FEEDBACK_ADDRESS, feedbackMailto, feedbackSubject, MAILTO_MAX } from './feedback'

const ORIGIN = 'https://stringutilitybelt.com'

describe('cleanMessage', () => {
  it('turns CRLF and CR into LF, drops control characters but tab and LF, and trims', () => {
    expect(cleanMessage('  one\r\ntwo\rthree\u001b[31m\u0000\tend \n')).toBe('one\ntwo\nthree[31m\tend')
  })
})

describe('checkFeedback', () => {
  const valid = { kind: 'bug', message: 'The hex view freezes on big files.', website: '' }

  it('returns the cleaned message, with only the fields the visitor filled in', () => {
    expect(checkFeedback({ ...valid, message: ' The hex view\r\nfreezes. ', email: ' ', page: '/util/hex/' })).toEqual({
      ok: true, bot: false, feedback: { kind: 'bug', message: 'The hex view\nfreezes.', page: '/util/hex/' },
    })
    expect(checkFeedback({ ...valid, email: 'Ada.L+sub@mail.example.co.uk' }))
      .toMatchObject({ ok: true, feedback: { email: 'Ada.L+sub@mail.example.co.uk' } })
  })

  it('counts the length after cleaning, so whitespace and control characters do not make a message', () => {
    expect(checkFeedback({ ...valid, message: `${' '.repeat(20)}short\u0007\u0007\u0007\u0007` }))
      .toMatchObject({ ok: false, field: 'message' })
    expect(checkFeedback({ ...valid, message: 'x'.repeat(4000) })).toMatchObject({ ok: true })
  })

  it.each([
    ['a display name', 'Ada <ada@example.com>'],
    ['a header injection', 'ada@example.com\nBcc: x@example.net'],
    ['two addresses', 'ada@example.com,bob@example.com'],
    ['no domain', 'ada@localhost'],
    ['a space', 'ada lovelace@example.com'],
    ['an address over 254 characters', `${'a'.repeat(250)}@example.com`],
  ])('refuses a reply address with %s', (_, email) => {
    expect(checkFeedback({ ...valid, email })).toMatchObject({ ok: false, field: 'email' })
  })

  it.each([
    ['a query', '/util/hex/?text=secret'],
    ['a fragment', '/#/p/N4IgdghgtgpiBcIDiAJA'],
    ['a full URL', 'https://evil.example/'],
    ['a space', '/util/hex /'],
    ['a path over 200 characters', `/${'a'.repeat(200)}`],
  ])('refuses a page with %s', (_, page) => {
    expect(checkFeedback({ ...valid, page })).toMatchObject({ ok: false, field: 'page' })
  })

  it('refuses anything but a message object of known fields', () => {
    expect(checkFeedback(null)).toMatchObject({ ok: false })
    expect(checkFeedback([valid])).toMatchObject({ ok: false })
    expect(checkFeedback({ ...valid, kind: 'praise' })).toMatchObject({ ok: false, field: 'kind' })
    expect(checkFeedback({ ...valid, message: 42 })).toMatchObject({ ok: false, field: 'message' })
    expect(checkFeedback({ ...valid, ip: '203.0.113.7' })).toMatchObject({ ok: false, field: undefined })
    expect(checkFeedback({ ...valid, website: 1 })).toMatchObject({ ok: false })
  })

  it('flags a message whose hidden field was filled in', () => {
    expect(checkFeedback({ ...valid, website: 'https://spam.example' })).toMatchObject({ ok: true, bot: true })
  })
})

describe('feedbackSubject', () => {
  it('is the kind and the first line, cut to 60 characters without splitting a character', () => {
    expect(feedbackSubject({ kind: 'utility', message: 'CSV  to\tMarkdown\nwith alignment' })).toBe('Utility suggestion: CSV to Markdown')
    const long = feedbackSubject({ kind: 'other', message: `${'😀'.repeat(70)}` })
    expect(long).toBe(`Feedback: ${'😀'.repeat(59)}…`)
  })
})

describe('feedbackMailto', () => {
  it('writes the message and the page into a mailto link to our address, with CRLF line breaks', () => {
    const href = feedbackMailto({ kind: 'bug', message: 'Line one\nLine two', page: '/util/hex/' }, ORIGIN)
    const url = new URL(href)
    expect(url.protocol).toBe('mailto:')
    expect(url.pathname).toBe(FEEDBACK_ADDRESS)
    expect(url.searchParams.get('subject')).toBe('Bug report: Line one')
    expect(decodeURIComponent(href.split('&body=')[1])).toBe(`Line one\r\nLine two\r\n\r\n—\r\nSent from ${ORIGIN}/util/hex/`)
  })

  it('cuts a message too long for a link, keeping the page and every character whole', () => {
    const href = feedbackMailto({ kind: 'other', message: 'ü😀'.repeat(2000), page: '/contact/' }, ORIGIN)
    expect(href.length).toBeLessThanOrEqual(MAILTO_MAX)
    const body = decodeURIComponent(href.split('&body=')[1])
    expect(body).toMatch(/^(?:ü😀)+ü?…\r\n\r\n—\r\nSent from https:\/\/stringutilitybelt\.com\/contact\/$/u)
  })
})
