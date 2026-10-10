import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AppShell, { Footer, Header } from './AppShell'
import { GITHUB_SPONSORS_URL } from '@/app/support'

describe('Header nav', () => {
  it('marks the link for the current route with aria-current="page"', () => {
    render(<Header current="utility" />)
    const nav = screen.getByRole('navigation', { name: 'main' })
    const current = nav.querySelectorAll('[aria-current="page"]')
    expect(current).toHaveLength(1)
    // crawlable paths, not #/ routes: search engines drop the fragment
    expect(current[0].getAttribute('href')).toBe('/utilities/')
  })

  it('treats a shared pipeline as the tool page', () => {
    render(<Header current="pipeline" />)
    expect(screen.getByRole('navigation', { name: 'main' }).querySelector('[aria-current="page"]')?.getAttribute('href')).toBe('/')
  })

  it('marks nothing when no route is given', () => {
    render(<Header />)
    expect(screen.getByRole('navigation', { name: 'main' }).querySelector('[aria-current]')).toBeNull()
  })
})

// route pages are lazy chunks: cold, on a loaded machine, one can outlast findBy's 1s default
const LAZY = { timeout: 10_000 }

describe('site links', () => {
  afterEach(() => { location.hash = ''; history.replaceState(null, '', '/') })

  it('has a footer linking the about, privacy and contact pages by their paths, and GitHub Sponsors in a new tab', () => {
    render(<Footer />)
    const links = within(screen.getByRole('navigation', { name: 'site' })).getAllByRole('link')
    expect(links.map(a => a.getAttribute('href'))).toEqual([
      '/utilities/', '/presets/', '/blog/', '/changelog/', '/integrations/', '/about/', '/privacy/', '/contact/', '/advertise/',
      GITHUB_SPONSORS_URL,
    ])
    const sponsor = screen.getByRole('link', { name: 'Sponsor on GitHub (opens in a new tab)' })
    expect([sponsor.getAttribute('target'), sponsor.getAttribute('rel')]).toEqual(['_blank', 'noopener'])
  })

  it('follows a plain click on a path link in place, leaving modified clicks to the browser', async () => {
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    try {
      render(<AppShell />)
      const utilities = within(screen.getByRole('navigation', { name: 'main' })).getByRole('link', { name: 'Utilities' })
      // a new-tab click: not ours to handle (jsdom would not open a tab either way)
      fireEvent.click(utilities, { ctrlKey: true })
      expect(location.pathname).toBe('/')
      fireEvent.click(utilities)
      expect(location.pathname).toBe('/utilities/')
      expect(await screen.findByRole('heading', { level: 1, name: 'All utilities' }, LAZY)).toBeTruthy()
      fireEvent.click(within(screen.getByRole('navigation', { name: 'site' })).getByRole('link', { name: 'Privacy policy' }))
      expect(await screen.findByRole('heading', { level: 1, name: 'Privacy Policy' }, LAZY)).toBeTruthy()
      expect(location.pathname).toBe('/privacy/')
    } finally {
      scroll.mockRestore()
    }
  })

  it('opens the integrations page at the section a header integration link names, in place', async () => {
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    const intoView = vi.fn(function (this: Element) { return this.id })
    Element.prototype.scrollIntoView = intoView
    try {
      render(<AppShell />)
      const integrations = screen.getByRole('navigation', { name: 'Integrations' })
      fireEvent.click(within(integrations).getByRole('link', { name: /^MCP server/ }))
      expect(location.pathname + location.hash).toBe('/integrations/#mcp-server-for-ai-agents')
      expect(await screen.findByRole('heading', { level: 1, name: 'Integrations' }, LAZY)).toBeTruthy()
      expect(intoView.mock.results.map(r => r.value)).toContain('mcp-server-for-ai-agents')
    } finally {
      scroll.mockRestore()
      delete (Element.prototype as Partial<Element>).scrollIntoView
    }
  })

  it('says so above the tool when the address is not a page, and keeps it out of search results', () => {
    history.replaceState(null, '', '/no/such/page')
    const { unmount } = render(<AppShell />)
    expect(screen.getByText('Page not found.')).toBeTruthy()
    expect(document.title).toBe('Page not found | String Utility Belt')
    expect(screen.getByPlaceholderText(/type or paste/i)).toBeTruthy()
    // the SPA fallback answered with index.html and a 200
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex')
    unmount()
    expect(document.querySelector('meta[name="robots"]')).toBeNull()
  })
})
