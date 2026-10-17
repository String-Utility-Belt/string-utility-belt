import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import UtilityPicker from './UtilityPicker'

const lastOf = <T,>(list: T[]): T => list[list.length - 1]

const METAS = vi.hoisted(() => [
  { id: 'base64_encode', name: 'base64 encode', category: 'Encoding', description: 'encode text as base64', accepts: 'string', produces: 'string', params: {}, tags: ['b64'], aliases: ['btoa'], env: [], streamable: false, exampleCount: 0 },
  { id: 'base64_decode', name: 'base64 decode', category: 'Decoding', description: 'decode base64 text', accepts: 'string', produces: 'string', params: {}, tags: ['b64'], aliases: ['atob'], env: [], streamable: false, exampleCount: 0 },
  { id: 'case', name: 'case', category: 'String Ops', description: 'change letter case', accepts: 'string', produces: 'string', params: { mode: {} }, tags: [], aliases: ['uppercase'], env: [], streamable: false, exampleCount: 0 },
  { id: 'get_bytes', name: 'get bytes', category: 'Encoding', description: 'utf-8 bytes of the input', accepts: 'string', produces: 'bytes', params: {}, tags: [], aliases: [], env: [], streamable: false, exampleCount: 0 },
  { id: 'json_pretty', name: 'json pretty', category: 'Data Formats', description: 'pretty-print json', accepts: 'json', produces: 'string', params: {}, tags: [], aliases: [], env: [], streamable: false, exampleCount: 0 },
])

vi.mock('@/app/registry', () => {
  const byId = new Map(METAS.map(m => [m.id, m]))
  return {
    registry: {
      list: () => METAS,
      get: (id: string) => byId.get(id),
      has: (id: string) => byId.has(id),
      categories: () => [...new Set(METAS.map(m => m.category))],
      byCategory: (cat?: string) => (!cat || cat === 'All' ? METAS : METAS.filter(m => m.category === cat)),
      load: vi.fn(),
    },
  }
})

beforeEach(() => localStorage.clear())

describe('UtilityPicker', () => {
  it('lists utilities and picks one on click', () => {
    const onPick = vi.fn()
    render(<UtilityPicker onPick={onPick} />)
    fireEvent.click(screen.getByText('base64 encode'))
    expect(onPick).toHaveBeenCalledWith('base64_encode')
  })

  it('links each card to its docs page, leaving the click to the in-app link handler without picking it', () => {
    const onPick = vi.fn()
    render(<UtilityPicker onPick={onPick} />)
    const link = screen.getByRole('link', { name: 'base64 encode docs' })
    expect(link).toHaveAttribute('href', '/util/base64_encode/')
    // stands in for AppShell's document-level handler (useInAppLinks), which follows the link in-app
    const reached: boolean[] = []
    const onDocumentClick = (e: MouseEvent) => { reached.push(!e.defaultPrevented); e.preventDefault() }
    document.addEventListener('click', onDocumentClick)
    try {
      fireEvent.click(link)
    } finally {
      document.removeEventListener('click', onDocumentClick)
    }
    expect(reached).toEqual([true])
    expect(onPick).not.toHaveBeenCalled()
  })

  it('highlights matched name characters while searching', () => {
    render(<UtilityPicker onPick={vi.fn()} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'case' } })
    const option = screen.getAllByRole('option')[0]
    expect(option).toHaveTextContent('case')
    expect(Array.from(option.querySelectorAll('mark')).map(m => m.textContent).join('')).toBe('case')
  })

  it('finds a utility by alias', () => {
    render(<UtilityPicker onPick={vi.fn()} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'uppercase' } })
    expect(screen.getByText('case')).toBeInTheDocument()
  })

  it('navigates with arrow keys and picks the active option with Enter', () => {
    const onPick = vi.fn()
    render(<UtilityPicker onPick={onPick} />)
    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'base64' } })
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(2)
    expect(options[0]).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(options[1]).toHaveAttribute('aria-selected', 'true')
    expect(input).toHaveAttribute('aria-activedescendant', options[1].id)
    // ArrowDown past the end stays on the last option
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(options[1]).toHaveAttribute('aria-selected', 'true')
    const expected = options[1].textContent!.includes('base64 encode') ? 'base64_encode' : 'base64_decode'
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(onPick).toHaveBeenCalledWith(expected)
  })

  it('Home/End jump to the first/last option and keyboard moves scroll it into view', () => {
    const scroll = vi.fn()
    const original = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = scroll
    try {
      render(<UtilityPicker onPick={vi.fn()} />)
      const input = screen.getByRole('combobox')
      fireEvent.keyDown(input, { key: 'End' })
      const options = screen.getAllByRole('option')
      expect(lastOf(options)).toHaveAttribute('aria-selected', 'true')
      expect(lastOf(scroll.mock.contexts)).toBe(lastOf(options))
      fireEvent.keyDown(input, { key: 'Home' })
      expect(options[0]).toHaveAttribute('aria-selected', 'true')
      expect(lastOf(scroll.mock.contexts)).toBe(options[0])
    } finally {
      Element.prototype.scrollIntoView = original
    }
  })

  it('does not pick on Ctrl+Enter (the run-now shortcut) or while an IME composition is confirmed', () => {
    const onPick = vi.fn()
    render(<UtilityPicker onPick={onPick} />)
    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'case' } })
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
    expect(onPick).not.toHaveBeenCalled()
  })

  it('announces the number of matches', () => {
    render(<UtilityPicker onPick={vi.fn()} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'base64' } })
    expect(screen.getByRole('status')).toHaveTextContent('2 utilities found')
  })

  it('gives every instance its own element ids', () => {
    render(<><UtilityPicker onPick={vi.fn()} /><UtilityPicker onPick={vi.fn()} /></>)
    const ids = [...screen.getAllByRole('option'), ...screen.getAllByRole('listbox')].map(el => el.id)
    expect(new Set(ids).size).toBe(ids.length)
    const [a, b] = screen.getAllByRole('combobox')
    expect(a.getAttribute('aria-controls')).not.toBe(b.getAttribute('aria-controls'))
  })

  it('Escape clears the query first, then calls onClose', () => {
    const onClose = vi.fn()
    render(<UtilityPicker onPick={vi.fn()} onClose={onClose} />)
    const input = screen.getByRole('combobox') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'case' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(input.value).toBe('')
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('keeps an Escape that only cleared the query from also closing an enclosing dialog', () => {
    const outer = vi.fn()
    render(<div onKeyDown={e => { if (e.key === 'Escape') outer() }}><UtilityPicker onPick={vi.fn()} /></div>)
    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'case' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(outer).not.toHaveBeenCalled()
    // nothing left to clear and no onClose: the picker does not own this Escape
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(outer).toHaveBeenCalledTimes(1)
  })

  it('names each option by its utility (and badge), not by every control inside the card', () => {
    render(<UtilityPicker onPick={vi.fn()} previousProduces={['string']} />)
    expect(screen.getByRole('option', { name: 'case' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'json pretty coerced' })).toHaveAccessibleDescription('text must be valid JSON')
  })

  it('filters by category chip', () => {
    render(<UtilityPicker onPick={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Decoding' }))
    expect(screen.getByText('base64 decode')).toBeInTheDocument()
    expect(screen.queryByText('base64 encode')).not.toBeInTheDocument()
  })

  it('toggles a favorite and shows it pinned (once) when the query is empty', () => {
    render(<UtilityPicker onPick={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Star case'))
    expect(screen.getByLabelText('Unstar case')).toHaveAttribute('aria-pressed', 'true')
    const favorites = screen.getByRole('group', { name: 'Starred' })
    expect(within(favorites).getByText('case')).toBeInTheDocument()
    expect(screen.getAllByText('case')).toHaveLength(1)
    expect(screen.getAllByRole('option')[0]).toHaveTextContent('case')
  })

  it('pins recently picked utilities in a "Recent" section (persisted)', () => {
    const { unmount } = render(<UtilityPicker onPick={vi.fn()} />)
    fireEvent.click(screen.getByText('json pretty'))
    unmount()
    render(<UtilityPicker onPick={vi.fn()} />)
    const recent = screen.getByRole('group', { name: 'Recent' })
    expect(within(recent).getByText('json pretty')).toBeInTheDocument()
  })

  it('applies the category chips and "only exact matches" to the pinned sections too', () => {
    localStorage.setItem('sub:pref:favorites', JSON.stringify(['json_pretty']))
    localStorage.setItem('sub:pref:recents', JSON.stringify(['base64_decode']))
    const { unmount } = render(<UtilityPicker onPick={vi.fn()} previousProduces={['string']} />)
    expect(screen.getByRole('group', { name: 'Starred' })).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('only exact matches'))
    // json_pretty accepts json: not an exact match for a string input
    expect(screen.queryByRole('group', { name: 'Starred' })).not.toBeInTheDocument()
    expect(screen.queryByText('json pretty')).not.toBeInTheDocument()
    unmount()
    render(<UtilityPicker onPick={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Encoding' }))
    expect(screen.queryByRole('group', { name: 'Starred' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Recent' })).not.toBeInTheDocument()
  })

  it('survives corrupted favorites/recents in storage', () => {
    localStorage.setItem('sub:pref:favorites', '{"case":true}')
    localStorage.setItem('sub:pref:recents', '"trim"')
    render(<UtilityPicker onPick={vi.fn()} />)
    expect(screen.getByText('base64 encode')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Star case'))
    expect(screen.getByLabelText('Unstar case')).toBeInTheDocument()
  })

  it('shows a badge for a lossy or coerced compatibility level and none for exact', () => {
    render(<UtilityPicker onPick={vi.fn()} previousProduces={['bytes']} />)
    // get_bytes accepts string -> bytes into string is lossy
    const getBytes = screen.getByText('get bytes').closest('[role="option"]') as HTMLElement
    expect(getBytes).toHaveTextContent('lossy')
    expect(getBytes).toHaveAttribute('aria-description', 'bytes are decoded as UTF-8')
    expect(within(getBytes).getByText('lossy')).toHaveAttribute('title', 'bytes are decoded as UTF-8')
    // base64_encode accepts string too -> also lossy from bytes
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'case' } })
    // case accepts string, from bytes -> lossy as well
    expect(screen.getByText('case').closest('[role="option"]')).toHaveTextContent('lossy')
  })

  it('shows a "coerced" badge when a string must become json', () => {
    render(<UtilityPicker onPick={vi.fn()} previousProduces={['string']} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'json pretty' } })
    const option = screen.getAllByRole('option')[0]
    expect(option).toHaveTextContent('json pretty')
    expect(option).toHaveTextContent('coerced')
    expect(option).toHaveAttribute('aria-description', 'text must be valid JSON')
  })

  it('shows no badge and hides nothing extra when types match exactly', () => {
    render(<UtilityPicker onPick={vi.fn()} previousProduces={['string']} />)
    const option = screen.getByText('case').closest('[role="option"]') as HTMLElement
    expect(option).not.toHaveTextContent('lossy')
    expect(option).not.toHaveTextContent('coerced')
  })

  it('treats an empty previousProduces as "no type information" (no badges, no toggle)', () => {
    render(<UtilityPicker onPick={vi.fn()} previousProduces={[]} />)
    expect(screen.queryByText('coerced')).not.toBeInTheDocument()
    expect(screen.queryByText('lossy')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('only exact matches')).not.toBeInTheDocument()
  })

  it('the "only exact matches" toggle filters out non-exact results', () => {
    render(<UtilityPicker onPick={vi.fn()} previousProduces={['bytes']} />)
    fireEvent.click(screen.getByLabelText('only exact matches'))
    // every listed utility here accepts 'string', none accept 'bytes' exactly
    expect(screen.getByText('No utilities match these filters.')).toBeInTheDocument()
  })

  it('offers to suggest a search that finds nothing, outside the listbox, when the host takes suggestions', () => {
    const onSuggest = vi.fn()
    const { rerender } = render(<UtilityPicker onPick={vi.fn()} onSuggest={onSuggest} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '  zzqx  ' } })
    expect(screen.getByText(/No utility matches “zzqx”/)).toBeInTheDocument()
    const suggest = screen.getByRole('button', { name: 'Suggest it' })
    expect(suggest.closest('[role="listbox"]')).toBeNull()
    fireEvent.click(suggest)
    expect(onSuggest).toHaveBeenCalledWith('zzqx')
    // without a host for it (an embed), only the message
    rerender(<UtilityPicker onPick={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Suggest it' })).toBeNull()
  })

  it("makes only the active option's favorite toggle a Tab stop, not one per card", () => {
    render(<UtilityPicker onPick={() => {}} />)
    const stars = () => screen.getAllByRole('button', { name: /^(Star|Unstar) / })
    expect(stars().filter(b => b.tabIndex === 0)).toHaveLength(1)
    expect(stars().find(b => b.tabIndex === 0)).toHaveAccessibleName('Star base64 encode')
    // arrowing in the search box moves the Tab stop along with the active option, in the order
    // shown: browsing groups by category, so Encoding's second utility comes next
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' })
    expect(stars().filter(b => b.tabIndex === 0)).toHaveLength(1)
    expect(stars().find(b => b.tabIndex === 0)).toHaveAccessibleName('Star get bytes')
  })

  it('lays the category chips out as one scrollable row below the sm breakpoint', () => {
    render(<UtilityPicker onPick={() => {}} />)
    const all = screen.getByRole('button', { name: 'All' })
    const row = all.parentElement as HTMLElement
    expect(row.className).toMatch(/(^|\s)overflow-x-auto(\s|$)/)
    expect(row.className).toMatch(/(^|\s)sm:flex-wrap(\s|$)/)
    expect(row.className).not.toMatch(/(^|\s)flex-wrap(\s|$)/)
    // chips keep their size instead of squeezing to fit the row
    expect(all.className).toContain('shrink-0')
    expect(all).toHaveAttribute('type', 'button')
  })
})
