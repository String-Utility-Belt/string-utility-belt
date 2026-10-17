import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { registry } from '@/app/registry'
import UtilitiesIndexPage from './UtilitiesIndexPage'
import { utilitiesTitle } from './seo'
import { EVENT_OPEN_FEEDBACK } from '@/app/feedback/open'

describe('UtilitiesIndexPage', () => {
  it('sets the document title, and restores it on leaving', () => {
    document.title = 'String Utility Belt'
    const { unmount } = render(<UtilitiesIndexPage />)
    expect(document.title).toBe(utilitiesTitle(registry.list().length))
    unmount()
    // otherwise the tool page (and any doc page restoring "its" previous title) keeps it
    expect(document.title).toBe('String Utility Belt')
  })

  it('lists every utility grouped by category, each linking to its pre-rendered doc page', () => {
    const { container } = render(<UtilitiesIndexPage />)
    const link = container.querySelector('a[href="/util/trim/"]')
    expect(link).toBeTruthy()
    expect(link!.textContent).toContain('trim')
    expect(link!.textContent).toContain(registry.get('trim')!.description)
    expect(container.querySelectorAll('a[href^="/util/"]')).toHaveLength(registry.list().length)
  })

  it('offers to suggest a utility when the filter matches nothing, starting from the filter text', () => {
    const opened = vi.fn()
    window.addEventListener(EVENT_OPEN_FEEDBACK, opened)
    try {
      render(<UtilitiesIndexPage />)
      fireEvent.change(screen.getByRole('searchbox', { name: 'Filter utilities' }), { target: { value: 'zzqx' } })
      fireEvent.click(screen.getByRole('button', { name: 'suggest a new utility' }))
      expect((opened.mock.calls[0][0] as CustomEvent).detail).toEqual({
        kind: 'utility', message: 'I searched for “zzqx” and would like a utility that ',
      })
    } finally {
      window.removeEventListener(EVENT_OPEN_FEEDBACK, opened)
    }
  })

  it('shows each category with its count', () => {
    render(<UtilitiesIndexPage />)
    const n = registry.byCategory('String Ops').length
    expect(screen.getByRole('heading', { level: 2, name: `String Ops ${n}` })).toBeTruthy()
  })

  it('filters case-insensitively by name, updating the counts', () => {
    const { container } = render(<UtilitiesIndexPage />)
    fireEvent.change(screen.getByLabelText('Filter utilities'), { target: { value: 'BASE64' } })
    expect(container.querySelector('a[href="/util/base64_encode/"]')).toBeTruthy()
    expect(container.querySelector('a[href="/util/trim/"]')).toBeNull()
    const shown = container.querySelectorAll('a[href^="/util/"]').length
    expect(screen.getByRole('status').textContent).toBe(`${shown} of ${registry.list().length} utilities`)
  })

  it('filters by alias', () => {
    const { container } = render(<UtilitiesIndexPage />)
    // count's alias is "wc"
    fireEvent.change(screen.getByLabelText('Filter utilities'), { target: { value: 'wc' } })
    expect(container.querySelector('a[href="/util/count/"]')).toBeTruthy()
  })

  it('shows a message when nothing matches', () => {
    render(<UtilitiesIndexPage />)
    fireEvent.change(screen.getByLabelText('Filter utilities'), { target: { value: 'zzzznotarealutility' } })
    expect(screen.getByText(/^Nothing matches “zzzznotarealutility”\. Try a format name like base64, json or hex, or/)).toBeTruthy()
    expect(screen.getByRole('status').textContent).toMatch(/^0 of /)
  })

  it('jumps to a category from its pill', () => {
    const original = Element.prototype.scrollIntoView // jsdom has none
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    try {
      render(<UtilitiesIndexPage />)
      const nav = screen.getByRole('navigation', { name: 'Categories' })
      const n = registry.byCategory('String Ops').length
      fireEvent.click(within(nav).getByRole('button', { name: `String Ops ${n}` }))
      expect(scroll).toHaveBeenCalledTimes(1)
      expect(scroll.mock.contexts[0]).toBe(screen.getByRole('heading', { level: 2, name: `String Ops ${n}` }).closest('section'))
    } finally {
      Element.prototype.scrollIntoView = original
    }
  })

  it('shows one of our own tools after the second category', () => {
    const { container } = render(<UtilitiesIndexPage />)
    const promo = container.querySelector('[data-promo-slot="inline"]')!
    expect(promo).toBeTruthy()
    const sections = container.querySelectorAll('section')
    expect(sections[1].nextElementSibling).toBe(promo)
  })
})
