import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import SitePage from './SitePage'
import { headingId, parseSitePage } from './sitePages'
import { readPref, writePref } from '@/app/prefs'
import { INTEGRATIONS_SEEN_PREF } from '@/app/integrations/links'

describe('SitePage', () => {
  it('renders the privacy policy with its own h1, sections and lists, and sets the head', () => {
    document.title = 'String Utility Belt'
    const { unmount } = render(<SitePage slug="privacy" />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Privacy Policy')
    expect(screen.getByRole('heading', { level: 2, name: 'Cookies and analytics' })).toBeTruthy()
    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(5)
    for (const link of screen.getAllByRole('link', { name: "Cloudflare's privacy policy" })) {
      expect(link.getAttribute('href')).toBe('https://www.cloudflare.com/privacypolicy/')
    }
    expect(document.title).toBe('Privacy Policy | String Utility Belt')
    unmount()
    expect(document.title).toBe('String Utility Belt')
  })

  it('lists the sections beside the page, by in-page links, with one of our own tools under them', () => {
    const { container } = render(<SitePage slug="privacy" />)
    const toc = screen.getByRole('navigation', { name: 'On this page' })
    const link = within(toc).getByRole('link', { name: 'Cookies and analytics' })
    expect(link).toHaveAttribute('href', '/privacy/#cookies-and-analytics')
    expect(container.querySelector('#cookies-and-analytics')?.tagName).toBe('H2')
    expect(container.querySelector('[data-promo-slot="rail"]')).toHaveAccessibleName('From String Utility Belt')
  })

  it('keeps our own promos off the advertise page, which sells the sponsor slot', () => {
    const { container } = render(<SitePage slug="advertise" />)
    expect(screen.getByRole('navigation', { name: 'On this page' })).toBeTruthy()
    expect(container.querySelector('[data-promo-slot]')).toBeNull()
  })

  it('ends the contact page with the feedback form, listed beside it, at the #feedback the footer links', () => {
    const { container } = render(<SitePage slug="contact" />)
    const section = container.querySelector('section#feedback') as HTMLElement
    expect(within(section).getByRole('heading', { level: 2, name: 'Send us a message' })).toBeTruthy()
    expect(within(section).getByRole('textbox', { name: 'Your message' })).toBeTruthy()
    const toc = screen.getByRole('navigation', { name: 'On this page' })
    expect(within(toc).getByRole('link', { name: 'Send us a message' })).toHaveAttribute('href', '/contact/#feedback')
  })

  it('carries the form on the contact page only', () => {
    render(<SitePage slug="about" />)
    expect(screen.queryByRole('textbox', { name: 'Your message' })).toBeNull()
  })

  it('links the site pages to each other by crawlable paths', () => {
    render(<SitePage slug="about" />)
    const hrefs = screen.getAllByRole('link').map(a => a.getAttribute('href'))
    expect(hrefs).toEqual(expect.arrayContaining(['/privacy/', '/utilities/', '/contact/']))
  })

  describe('opened at a section', () => {
    // jsdom has no scrollIntoView
    const scroll = vi.fn(function (this: Element) { return this.id })
    beforeEach(() => { Element.prototype.scrollIntoView = scroll })
    afterEach(() => {
      history.replaceState(null, '', '/')
      scroll.mockClear()
      delete (Element.prototype as Partial<Element>).scrollIntoView
    })

    it('scrolls to the #section in the address once its content is in', () => {
      history.replaceState(null, '', '/integrations/#command-line-tool')
      render(<SitePage slug="integrations" />)
      expect(scroll.mock.results.map(r => r.value)).toEqual(['command-line-tool'])
    })

    it('leaves the scroll alone without a section, and for a #/ route', () => {
      history.replaceState(null, '', '/integrations/')
      const first = render(<SitePage slug="integrations" />)
      first.unmount()
      history.replaceState(null, '', '/integrations/#/')
      render(<SitePage slug="integrations" />)
      expect(scroll).not.toHaveBeenCalled()
    })
  })

  it('marks the header\'s integrations group as seen once the integrations page is read', () => {
    writePref(INTEGRATIONS_SEEN_PREF, false)
    render(<SitePage slug="about" />)
    expect(readPref(INTEGRATIONS_SEEN_PREF, false)).toBe(false)
    render(<SitePage slug="integrations" />)
    expect(readPref(INTEGRATIONS_SEEN_PREF, false)).toBe(true)
  })
})

describe('parseSitePage', () => {
  it('reads the SEO title and description from frontmatter and keeps the document headings', () => {
    const page = parseSitePage('---\ntitle: About Us\ndescription: Who we are.\n---\n# About\n\n## Why\n\n- one\n- two\n')
    expect(page).toMatchObject({ title: 'About Us', description: 'Who we are.' })
    expect(page.html).toContain('<h1 class="md-h1">About</h1>')
    expect(page.html).toContain('<h2 id="why" class="md-h2">Why</h2>')
    expect(page.html).toContain('<ul class="md-ul"><li class="md-li">one</li><li class="md-li">two</li></ul>')
    expect(page.sections).toEqual([{ id: 'why', title: 'Why' }])
  })

  it('gives each section heading a unique id from its text, for links to a section', () => {
    const page = parseSitePage('# Integrations\n\n## VS Code extension\n\n### Setup\n\n## `subelt` & friends\n\n### Setup\n')
    expect(page.html).toContain('<h1 class="md-h1">Integrations</h1>')
    expect(page.html).toContain('<h2 id="vs-code-extension" class="md-h2">VS Code extension</h2>')
    expect(page.html).toMatch(/<h2 id="subelt-friends" class="md-h2"><code[^>]*>subelt<\/code> &amp; friends<\/h2>/)
    expect([...page.html.matchAll(/<h3 id="([^"]+)"/g)].map(m => m[1])).toEqual(['setup', 'setup-2'])
    // the contents list: `##` sections only, as plain text
    expect(page.sections).toEqual([
      { id: 'vs-code-extension', title: 'VS Code extension' },
      { id: 'subelt-friends', title: 'subelt & friends' },
    ])
  })
})

describe('headingId', () => {
  it('slugs the heading text, without tags or entities', () => {
    expect(headingId('MCP server for AI agents')).toBe('mcp-server-for-ai-agents')
    expect(headingId('<code class="md-code">a&lt;b</code>  —  C#')).toBe('a-b-c')
    expect(headingId('—')).toBe('')
  })
})
