import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import Docs from './Docs'
import { DOCS_DESCRIPTION, DOCS_TITLE } from '@/app/pages/seo'

describe('<Docs />', () => {
  it('renders the usage guide', () => {
    render(<Docs />)
    expect(screen.getByRole('heading', { name: /how to chain text tools into a pipeline/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Build a pipeline' })).toBeInTheDocument()
  })

  it('links to the tool and the utilities index by their crawlable paths', () => {
    render(<Docs />)
    expect(screen.getByRole('link', { name: /utilities index/i })).toHaveAttribute('href', '/utilities/')
    expect(screen.getByRole('link', { name: 'Open the tool' })).toHaveAttribute('href', '/')
  })

  it('jumps to a section in place instead of following the link', () => {
    const original = Element.prototype.scrollIntoView // jsdom has none
    const scrolledTo = []
    Element.prototype.scrollIntoView = function () { scrolledTo.push(this.id) }
    try {
      render(<Docs />)
      const link = within(screen.getByRole('navigation', { name: 'Docs sections' })).getByRole('link', { name: 'Utility reference' })
      // a plain in-page anchor, so the jump works without scripts too
      expect(link).toHaveAttribute('href', '/docs/#utilities')
      // fireEvent returns false when the click's default action was prevented
      expect(fireEvent.click(link)).toBe(false)
      expect(scrolledTo).toEqual(['utilities'])
    } finally {
      Element.prototype.scrollIntoView = original
    }
  })

  it('shows one of our own tools under the section list, never a sponsor', () => {
    const { container } = render(<Docs />)
    const promo = container.querySelector('[data-promo-slot="rail"]')
    expect(promo).not.toBeNull()
    expect(promo).toHaveAccessibleName('From String Utility Belt')
  })

  it('sets the title and description of the pre-rendered /docs/ page, restoring them on leaving', () => {
    document.title = 'before'
    const { unmount } = render(<Docs />)
    expect(document.title).toBe(DOCS_TITLE)
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(DOCS_DESCRIPTION)
    unmount()
    expect(document.title).toBe('before')
  })
})
