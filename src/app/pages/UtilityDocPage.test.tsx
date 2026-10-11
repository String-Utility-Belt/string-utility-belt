import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'
import { getRoute, onRouteChange } from '@/lib/router'
import UtilityDocPage from './UtilityDocPage'
import { PRESET_INDEX } from '@/presets/_generated/index'

const STORAGE_KEY = 'string-utility-belt'

afterEach(() => {
  localStorage.removeItem(STORAGE_KEY)
  location.hash = ''
})

const playgroundOutput = () => screen.getByRole('status', { name: 'playground output' })

describe('UtilityDocPage', () => {
  it("renders its guide's heading, description and category", () => {
    render(<UtilityDocPage id="trim" />)
    const heading = screen.getByRole('heading', { level: 1, name: 'Trim Whitespace' })
    expect(screen.getByText('Remove leading and trailing whitespace.')).toBeTruthy()
    const header = within(heading.closest('header')!)
    // the breadcrumb names it, and so does the category chip
    expect(within(header.getByRole('navigation', { name: 'Breadcrumb' })).getByText('String Ops')).toBeTruthy()
    expect(header.getAllByText('String Ops')).toHaveLength(2)
    expect(header.getByRole('link', { name: 'Utilities' }).getAttribute('href')).toBe('/utilities/')
  })

  it('sets the document title and meta description, and restores both on leaving', () => {
    document.title = 'String Utility Belt'
    const { unmount } = render(<UtilityDocPage id="trim" />)
    expect(document.title).toBe('trim | String Utility Belt')
    const meta = document.querySelector('meta[name="description"]')
    expect(meta?.getAttribute('content')).toBe('Remove leading and trailing whitespace.')

    unmount()
    // otherwise the tool page keeps a stale "trim — …" tab title and description
    expect(document.title).toBe('String Utility Belt')
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content') ?? null)
      .not.toBe('Remove leading and trailing whitespace.')
  })

  it('shows a friendly not-found for an unknown id, with a link to browse utilities', () => {
    render(<UtilityDocPage id="does-not-exist" />)
    expect(screen.getByRole('heading', { level: 1, name: 'No utility called “does-not-exist”' })).toBeTruthy()
    const link = screen.getByRole('link', { name: /browse all utilities/i })
    expect(link.getAttribute('href')).toBe('/utilities/')
  })

  it('keeps an unknown utility out of search indexes (the host answers any /util/<id>/), and lets go on leaving', () => {
    const { unmount } = render(<UtilityDocPage id="does-not-exist" />)
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex')
    unmount()
    expect(document.querySelector('meta[name="robots"]')).toBeNull()
  })

  it('links the presets that use the utility by their pre-rendered paths', () => {
    const using = PRESET_INDEX.find(r => r.utilityIds.includes('line_dedupe'))!
    render(<UtilityDocPage id="line_dedupe" />)
    const section = screen.getByRole('heading', { name: /^Presets that use/ }).closest('section')!
    expect(within(section).getAllByRole('link').map(a => a.getAttribute('href'))).toContain(`/presets/${using.slug}/`)
  })

  it('has no preset section for a utility no preset uses', () => {
    render(<UtilityDocPage id="atbash" />)
    expect(screen.queryByRole('heading', { name: /^Presets that use/ })).toBeNull()
  })

  it('renders a params table with kind, default, bounds and a description', () => {
    render(<UtilityDocPage id="pad" />)
    const table = within(screen.getByRole('table'))
    expect(table.getByText('length')).toBeTruthy()
    expect(table.getByText('pad character')).toBeTruthy() // a label different from its key
    expect(table.getByText('char')).toBeTruthy()
    expect(table.getByText('side')).toBeTruthy()
    expect(table.getByText('10')).toBeTruthy() // length's default
    expect(table.getByText(/0–1000000/)).toBeTruthy() // length's bounds (capped: amplifying param)
    expect(table.getByText('end, start, both')).toBeTruthy() // side's options
    expect(table.getByText('target length')).toBeTruthy()
    expect(table.getByText('number')).toBeTruthy() // length's kind
  })

  it('carries no extra promo after the playground or in the side column: its sponsor slot is its one promo', () => {
    const { container } = render(<UtilityDocPage id="trim" />)
    expect(container.querySelector('[data-promo-slot]')).toBeNull()
  })

  it('copies the playground output', async () => {
    const writeText = vi.fn(async () => {})
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    try {
      render(<UtilityDocPage id="trim" />)
      fireEvent.change(screen.getByLabelText('playground input'), { target: { value: '  padded  ' } })
      await waitFor(() => expect(playgroundOutput().textContent).toBe('padded'), { timeout: 5000 })
      fireEvent.click(screen.getByRole('button', { name: 'Copy output' }))
      expect(writeText).toHaveBeenCalledWith('padded')
      expect(await screen.findByRole('button', { name: 'Copied' })).toBeTruthy()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('shows environment notes', () => {
    render(<UtilityDocPage id="custom_js" />)
    expect(screen.getByText(/never run this on a server/i)).toBeTruthy()
  })

  it('renders worked examples with input and output', async () => {
    render(<UtilityDocPage id="count" />)
    expect(await screen.findByText('a couple of lines', {}, { timeout: 5000 })).toBeTruthy()
    // getByText's default normalizer collapses newlines, so compare raw textContent instead.
    expect(screen.getByText(/Hello world/).textContent).toBe('Hello world\nfoo bar baz')
    expect(screen.getByText(/characters: 23/).textContent).toBe('characters: 23\nwords: 5\nlines: 2')
  })

  it('labels an example input that is not plain text with its encoding', async () => {
    render(<UtilityDocPage id="gzip_decompress" />)
    expect(await screen.findByText('decompress a gzip stream to text', {}, { timeout: 5000 })).toBeTruthy()
    expect(screen.getByText(/input \(hex\)/i)).toBeTruthy()
  })

  it('runs the playground and shows output as the input changes', async () => {
    render(<UtilityDocPage id="trim" />)
    fireEvent.change(screen.getByLabelText('playground input'), { target: { value: '  padded  ' } })
    await waitFor(() => expect(playgroundOutput().textContent).toBe('padded'), { timeout: 5000 })
  })

  it('re-runs the playground when a param changes', async () => {
    const { container } = render(<UtilityDocPage id="pad" />)
    fireEvent.change(screen.getByLabelText('playground input'), { target: { value: 'ab' } })
    await waitFor(() => expect(playgroundOutput().textContent).toBe('ab        '), { timeout: 5000 })
    fireEvent.change(screen.getByLabelText('pad character'), { target: { value: '*' } })
    await waitFor(() => expect(playgroundOutput().textContent).toBe('ab********'), { timeout: 5000 })
    // its controls are namespaced so they can never collide with a step editor's ids
    expect(container.querySelector('[id^="doc-playground-pad-"]')).toBeTruthy()
  })

  it('shows a utility error in the playground politely (it fires while typing)', async () => {
    render(<UtilityDocPage id="json_pretty" />)
    fireEvent.change(screen.getByLabelText('playground input'), { target: { value: '{not json' } })
    const status = await screen.findByRole('status', { name: 'playground error' }, { timeout: 5000 })
    expect(status.textContent).not.toBe('')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(playgroundOutput().textContent).toBe('')
  })

  it('loads a worked example into the playground', async () => {
    render(<UtilityDocPage id="pad" />)
    fireEvent.click(await screen.findByRole('button', { name: /try example: zero-pad a number/i }, { timeout: 5000 }))
    expect((screen.getByLabelText('playground input') as HTMLTextAreaElement).value).toBe('42')
    await waitFor(() => expect(playgroundOutput().textContent).toBe('000042'), { timeout: 5000 })
  })

  it('appends the step (with the playground params) to the saved pipeline and navigates home', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 2, steps: [{ id: 'a', utilityId: 'trim', enabled: true, params: {} }], showPreviews: true }))
    render(<UtilityDocPage id="pad" />)
    fireEvent.change(screen.getByLabelText('pad character'), { target: { value: '*' } })
    fireEvent.click(screen.getByRole('button', { name: 'Use in pipeline' }))
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    expect(saved.steps.map((s: { utilityId: string }) => s.utilityId)).toEqual(['trim', 'pad'])
    expect(saved.steps[1].params).toEqual({ length: 10, char: '*', side: 'end' })
    expect(location.hash).toBe('#/')
  })

  it('"Use in pipeline" opens the tool even from the pre-rendered /util/<id>/ page', () => {
    // there the path itself routes to this doc page, so '#/' alone would land right back here
    history.replaceState(null, '', '/util/pad/')
    try {
      expect(getRoute().name).toBe('utility')
      const onRoute = vi.fn()
      const off = onRouteChange(onRoute)
      render(<UtilityDocPage id="pad" />)
      fireEvent.click(screen.getByRole('button', { name: 'Use in pipeline' }))
      off()
      expect(getRoute().name).toBe('home')
      expect(onRoute).toHaveBeenCalledWith(expect.objectContaining({ name: 'home' }))
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
      expect(saved.steps.map((s: { utilityId: string }) => s.utilityId)).toEqual(['pad'])
    } finally {
      history.replaceState(null, '', '/')
    }
  })

  it('titles the not-found page', () => {
    document.title = 'String Utility Belt'
    const { unmount } = render(<UtilityDocPage id="does-not-exist" />)
    expect(document.title).toBe('Unknown utility | String Utility Belt')
    unmount()
    expect(document.title).toBe('String Utility Belt')
  })

  it('lists the most closely related utilities first', () => {
    render(<UtilityDocPage id="url_decode" />)
    const section = screen.getByRole('heading', { name: 'Related utilities' }).closest('section')!
    const links = within(section).getAllByRole('link').filter(a => a.getAttribute('href')!.startsWith('/util/'))
    expect(links.length).toBeLessThanOrEqual(6)
    expect(within(section).getByRole('link', { name: /all utilities/i }).getAttribute('href')).toBe('/utilities/')
    // a crawlable path, not a #/ fragment search engines would drop
    expect(links[0].getAttribute('href')).toBe('/util/url_encode/')
  })

  it('follows a related link in-app, without a reload, to the pre-rendered path', () => {
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    const onRoute = vi.fn()
    const off = onRouteChange(onRoute)
    try {
      render(<UtilityDocPage id="url_decode" />)
      const section = screen.getByRole('heading', { name: 'Related utilities' }).closest('section')!
      const link = within(section).getAllByRole('link')[0]
      expect(fireEvent.click(link)).toBe(false) // default (a full page load) prevented
      expect(location.pathname).toBe('/util/url_encode/')
      expect(onRoute).toHaveBeenCalledWith({ name: 'utility', params: { id: 'url_encode' } })
    } finally {
      off()
      scroll.mockRestore()
      history.replaceState(null, '', '/')
    }
  })

  it('leaves a modified click on a related link to the browser (open in a new tab)', () => {
    render(<UtilityDocPage id="url_decode" />)
    const section = screen.getByRole('heading', { name: 'Related utilities' }).closest('section')!
    expect(fireEvent.click(within(section).getAllByRole('link')[0], { ctrlKey: true })).toBe(true)
    expect(location.pathname).toBe('/')
  })

  it('shows the same run as a subelt command and MCP call, following the playground', () => {
    render(<UtilityDocPage id="trim" />)
    const run = screen.getByRole('region', { name: 'Run it from your terminal or AI agent' })
    expect(within(run).getByText('npx subelt -i input.txt trim')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('playground input'), { target: { value: '  hi  ' } })
    expect(within(run).getByText("npx subelt -t '  hi  ' trim", { normalizer: t => t })).toBeTruthy()
    expect(within(run).getByText('{"id":"trim"}')).toBeTruthy()
  })

  it('offers no command line for a utility that needs a browser', () => {
    render(<UtilityDocPage id="xml_to_json" />)
    expect(screen.queryByRole('region', { name: 'Run it from your terminal or AI agent' })).toBeNull()
  })
})

const GUIDE = `---
title: Trim Whitespace Online — Strip Leading & Trailing Spaces
description: Remove leading and trailing whitespace from text.
---
## What trim removes

Spaces, tabs and newlines at **both ends**. See [trim lines](/util/trim_lines/).

- one
- two

\`\`\`example
title: padded
input:   padded  
output: padded
\`\`\`
`

function stubFetch(body: string, type = 'text/markdown; charset=utf-8') {
  const fetchMock = vi.fn(async () => new Response(body, { headers: { 'content-type': type } }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('UtilityDocPage guide', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('fetches the guide and renders it collapsed, in the DOM for crawlers', async () => {
    const fetchMock = stubFetch(GUIDE)
    render(<UtilityDocPage id="trim" />)
    expect(fetchMock).toHaveBeenCalledWith('/guides/trim.md')
    const heading = await screen.findByRole('heading', { level: 2, name: 'How trim works' })
    const details = heading.closest('details')!
    expect(details.open).toBe(false)
    await waitFor(() => expect(within(details).getByRole('heading', { level: 3, name: 'What trim removes' })).toBeTruthy())
    expect(within(details).getByText('both ends').tagName).toBe('STRONG')
    expect(within(details).getAllByRole('listitem').map(li => li.textContent)).toEqual(['one', 'two'])
    expect(within(details).getByText('padded', { selector: 'figcaption' })).toBeTruthy()
    fireEvent.click(within(details).getByText('How trim works'))
    expect(details.open).toBe(true)
  })

  it('uses the guide title and description for the document <head>', async () => {
    stubFetch(GUIDE)
    render(<UtilityDocPage id="trim" />)
    // 56 characters: the site name would push it past what a search result shows
    await waitFor(() => expect(document.title).toBe('Trim Whitespace Online — Strip Leading & Trailing Spaces'))
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content'))
      .toBe('Remove leading and trailing whitespace from text.')
  })

  it('follows a guide link to another utility in-app', async () => {
    stubFetch(GUIDE)
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    try {
      render(<UtilityDocPage id="trim" />)
      const link = await screen.findByRole('link', { name: 'trim lines' })
      expect(link.getAttribute('href')).toBe('/util/trim_lines/')
      expect(fireEvent.click(link)).toBe(false)
      expect(location.pathname).toBe('/util/trim_lines/')
    } finally {
      scroll.mockRestore()
      history.replaceState(null, '', '/')
    }
  })

  it('shows no guide section when the server answers with the SPA fallback page', async () => {
    const fetchMock = stubFetch('<!doctype html><html></html>', 'text/html')
    render(<UtilityDocPage id="trim" />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'How trim works' })).toBeNull())
    expect(document.title).toBe('trim | String Utility Belt')
  })
})
