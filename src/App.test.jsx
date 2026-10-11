
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import App from './App'

const STORAGE_KEY = 'string-utility-belt'

afterEach(() => {
  location.hash = ''
  history.replaceState(null, '', '/')
  localStorage.removeItem(STORAGE_KEY)
})

describe('<App />', () => {
  it('renders heading', () => {
    render(<App />)
    const matches = screen.getAllByText(/string utility belt/i)
    expect(matches.length).toBeGreaterThan(0)
  })

  it('renders the usage guide at /docs/, its nav link marked as the current page', async () => {
    history.replaceState(null, '', '/docs/')
    render(<App />)
    expect(await screen.findByRole('heading', { name: /how to use string utility belt/i })).toBeTruthy()
    const nav = screen.getByRole('link', { name: 'Docs' })
    expect(nav).toHaveAttribute('href', '/docs/')
    expect(nav).toHaveAttribute('aria-current', 'page')
    expect(screen.queryByPlaceholderText(/type or paste/i)).toBeNull()
  })

  it('still renders the usage guide at the old #/docs', async () => {
    location.hash = '#/docs'
    render(<App />)
    expect(await screen.findByRole('heading', { name: /how to use string utility belt/i })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Docs' })).toHaveAttribute('aria-current', 'page')
  })

  it("follows the header's Docs link in place, then the guide's links back into the app", async () => {
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    try {
      render(<App />)
      fireEvent.click(screen.getByRole('link', { name: 'Docs' }))
      expect(location.pathname).toBe('/docs/')
      expect(await screen.findByRole('heading', { name: /how to use string utility belt/i })).toBeTruthy()
      fireEvent.click(screen.getByRole('link', { name: /utilities index/i }))
      expect(location.pathname).toBe('/utilities/')
      expect(await screen.findByRole('heading', { level: 1, name: 'All text and string tools' })).toBeTruthy()
    } finally {
      scroll.mockRestore()
    }
  })

  it('renders the blog index at #/blog', async () => {
    location.hash = '#/blog'
    render(<App />)
    // route pages are lazy chunks, so the heading arrives asynchronously
    expect(await screen.findByRole('heading', { name: /^blog$/i })).toBeTruthy()
    expect(await screen.findByText(/no posts yet/i)).toBeTruthy()
    expect(screen.queryByPlaceholderText(/type or paste/i)).toBeNull()
  })

  it('renders a blog post at #/blog/:slug', async () => {
    location.hash = '#/blog/does-not-exist'
    render(<App />)
    expect(await screen.findByText(/post not found/i)).toBeTruthy()
    expect(screen.queryByPlaceholderText(/type or paste/i)).toBeNull()
  })

  it('navigates between tool and blog on hash change', async () => {
    render(<App />)
    expect(screen.getByPlaceholderText(/type or paste/i)).toBeTruthy()
    location.hash = '#/blog'
    fireEvent(window, new HashChangeEvent('hashchange'))
    expect(await screen.findByText(/no posts yet/i)).toBeTruthy()
    location.hash = '#/'
    fireEvent(window, new HashChangeEvent('hashchange'))
    await waitFor(() => expect(screen.getByPlaceholderText(/type or paste/i)).toBeTruthy())
  })

  it('seeds param defaults when a step switches utility', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      steps: [{ id: 's1', utilityId: 'trim', enabled: true, params: {} }],
      showPreviews: false,
    }))
    render(<App />)
    const input = screen.getByPlaceholderText(/type or paste/i)
    fireEvent.change(input, { target: { value: 'a'.repeat(30) } })
    // the step's name opens a picker that swaps its utility
    fireEvent.click(screen.getByRole('button', { name: 'trim, change utility' }))
    const search = screen.getByRole('combobox', { name: 'Search utilities' })
    fireEvent.change(search, { target: { value: 'truncate' } })
    fireEvent.keyDown(search, { key: 'Enter' })
    // truncate defaults: length 20, ellipsis '…' -> 19 chars + ellipsis
    // the result arrives after a lazy chunk load plus a debounced run — allow for a loaded machine
    expect(await screen.findByText('a'.repeat(19) + '…', {}, { timeout: 5000 })).toBeTruthy()
  })
})
