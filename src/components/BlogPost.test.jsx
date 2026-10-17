import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import BlogPost from './BlogPost'
import { discussLinks, parseTags } from './blogManifest'
import { EVENT_OPEN_FEEDBACK } from '@/app/feedback/open'

const POST = `---\ntitle: Hello World\ndate: 2025-01-15\n---\n# Heading\n\nSome **bold** text.`

describe('<BlogPost />', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('shows not-found when the fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    render(<BlogPost slug="base64-encode-decode-online" />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Post not found.')
  })

  it('renders the frontmatter title, a locale-formatted date, and the markdown body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(POST) }))
    render(<BlogPost slug="hello" />)
    await screen.findByText('Hello World')
    // a date-only value is a calendar day: no time-zone shift to the 14th
    expect(screen.getByText('January 15, 2025')).toBeInTheDocument()
    expect(screen.getByText('Heading').tagName).toBe('H1')
    expect(document.querySelector('.md-p strong')?.textContent).toBe('bold')
  })

  it('shows the translated not-found message on a failed fetch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    render(<BlogPost slug="missing" />)
    await waitFor(() => expect(screen.getByText('Post not found.')).toBeInTheDocument())
  })

  it('renders the body as prose, with token classes and no bg-white', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(POST) }))
    const { container } = render(<BlogPost slug="hello" />)
    await screen.findByText('Hello World')
    const article = container.querySelector('article')
    expect(article.className).not.toMatch(/bg-white/)
    expect(container.querySelector('.md .md-p')?.textContent).toBe('Some bold text.')
  })

  it('links back to the blog when the post is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    render(<BlogPost slug="missing" />)
    await screen.findByRole('alert')
    expect(screen.getByRole('link', { name: /all posts/i })).toHaveAttribute('href', '/blog/')
  })
})

describe('<BlogPost /> (review regressions)', () => {
  afterEach(() => vi.unstubAllGlobals())
  const res = (text, type = 'text/markdown') => ({ ok: true, headers: { get: () => type }, text: () => Promise.resolve(text) })

  it('parses CRLF frontmatter and strips quotes from the title', async () => {
    const crlf = ['---', 'title: "Quoted: Title"', 'date: 2025-09-18', '---', '', '# H', '', 'para'].join('\r\n')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(crlf)))
    const { container } = render(<BlogPost slug="q" />)
    await screen.findByText('Quoted: Title')
    expect(container.textContent).not.toContain('---')
    expect(container.querySelector('.md-p')?.textContent).toBe('para')
  })

  it('shows the frontmatter date as that calendar day regardless of time zone', async () => {
    const tz = process.env.TZ
    process.env.TZ = 'America/Los_Angeles'
    try {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(POST)))
      render(<BlogPost slug="hello" />)
      const time = await screen.findByText('January 15, 2025')
      expect(time.closest('time')?.getAttribute('datetime')).toBe('2025-01-15')
    } finally {
      process.env.TZ = tz
    }
  })

  it('treats an HTML response (SPA fallback for a missing .md) as not found', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res('<!doctype html><html></html>', 'text/html; charset=utf-8')))
    render(<BlogPost slug="missing" />)
    await screen.findByText('Post not found.')
  })

  it('recovers from a not-found post when navigating to another slug', async () => {
    const posts = vi.fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce(res(POST))
    vi.stubGlobal('fetch', vi.fn(url => url === '/blog/_manifest.json' ? Promise.reject(new Error('offline')) : posts(url)))
    const { rerender } = render(<BlogPost slug="missing" />)
    await screen.findByText('Post not found.')
    rerender(<BlogPost slug="hello" />)
    await screen.findByText('Hello World')
    expect(screen.queryByText('Post not found.')).toBeNull()
  })

  it('announces loading instead of rendering an empty card', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    render(<BlogPost slug="slow" />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading…')
    expect(document.querySelector('article')?.getAttribute('aria-busy')).toBe('true')
  })
})

describe('<BlogPost /> (responsive regressions)', () => {
  afterEach(() => vi.unstubAllGlobals())
  const res = (text, type = 'text/markdown') => ({ ok: true, headers: { get: () => type }, text: () => Promise.resolve(text) })

  it('lets a long inline code span (a file path) break instead of forcing the page wider', async () => {
    const text = '---\ntitle: Paths\n---\n\n# Paths\n\nsee `src/utilities/_generated/manifest.ts` for counts'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(text)))
    render(<BlogPost slug="paths" />)
    await screen.findByText('Paths')
    const code = document.querySelector('.md-code')
    expect(code?.textContent).toBe('src/utilities/_generated/manifest.ts')
    expect(code.className).toContain('wrap-break-word')
  })
})

describe('<BlogPost /> title', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('renders a single h1 when the body repeats the frontmatter title', async () => {
    const text = '---\ntitle: Same\n---\n\n# Same\n\nBody text.'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(text) }))
    render(<BlogPost slug="same" />)
    await screen.findByText('Body text.')
    expect(screen.getAllByRole('heading', { level: 1 }).map(h => h.textContent)).toEqual(['Same'])
  })
})

describe('<BlogPost /> revisions and markup', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('shows the update date of a revised post, and keeps lists and h2 sections as written', async () => {
    const text = '---\ntitle: Revised\ndate: 2025-09-18\nupdated: 2026-09-25\n---\n\n## Part\n\n- one\n- two\n'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(text) }))
    render(<BlogPost slug="revised" />)
    await screen.findByText('Revised')
    expect(screen.getByText('September 25, 2026').closest('time')?.getAttribute('datetime')).toBe('2026-09-25')
    expect(screen.getByRole('heading', { level: 2, name: 'Part' })).toBeTruthy()
    expect(screen.getAllByRole('listitem').map(li => li.textContent)).toEqual(['one', 'two'])
    expect(document.title).toBe('Revised | String Utility Belt')
  })
})

describe('<BlogPost /> header and footer', () => {
  afterEach(() => vi.unstubAllGlobals())
  const TAGGED = '---\ntitle: Tagged\ndescription: What it covers.\ndate: 2025-09-18\ntags: [md5, "hashing", security]\n---\n\nBody.'
  const MANIFEST = [
    { slug: 'tagged', title: 'Tagged' },
    { slug: 'other', title: 'Other post' },
  ]
  const fetchFor = (text) => vi.fn(url => Promise.resolve(url === '/blog/_manifest.json'
    ? { ok: true, json: () => Promise.resolve(MANIFEST) }
    : { ok: true, headers: { get: () => 'text/markdown' }, text: () => Promise.resolve(text) }))

  it('shows a breadcrumb, the description and the tags in the header, with the sponsor slot last', async () => {
    vi.stubGlobal('fetch', fetchFor(TAGGED))
    render(<BlogPost slug="tagged" />)
    await screen.findByText('Tagged', { selector: 'h1' })
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(crumbs).getByRole('link', { name: 'Blog' })).toHaveAttribute('href', '/blog/')
    const header = document.querySelector('header')
    expect(within(header).getByText('What it covers.')).toBeTruthy()
    expect([...header.querySelectorAll('.chip')].map(c => c.textContent)).toEqual(['md5', 'hashing', 'security'])
    expect(header.lastElementChild).toHaveClass('sponsor')
  })

  it('ends with the other posts, by their crawlable paths, and no extra promo', async () => {
    vi.stubGlobal('fetch', fetchFor(TAGGED))
    const { container } = render(<BlogPost slug="tagged" />)
    const other = await screen.findByRole('link', { name: 'Other post' })
    expect(other).toHaveAttribute('href', '/blog/other/')
    expect(screen.queryByRole('link', { name: 'Tagged' })).toBeNull()
    expect(container.querySelector('[data-promo-slot]')).toBeNull()
  })
})

describe('<BlogPost /> discussion and feedback', () => {
  afterEach(() => vi.unstubAllGlobals())
  const fetchFor = (text) => vi.fn(url => Promise.resolve(url === '/blog/_manifest.json'
    ? { ok: true, json: () => Promise.resolve([]) }
    : { ok: true, headers: { get: () => 'text/markdown' }, text: () => Promise.resolve(text) }))
  const DISCUSSED = '---\ntitle: Discussed\ndiscuss: [https://dev.to/someone/discussed-1a2b, https://news.ycombinator.com/item?id=1]\n---\n\nBody.'
  const QUIET = '---\ntitle: Quiet\n---\n\nBody.'

  it('links the threads its frontmatter lists, by site name, each in a new tab', async () => {
    vi.stubGlobal('fetch', fetchFor(DISCUSSED))
    render(<BlogPost slug="discussed" />)
    const dev = await screen.findByRole('link', { name: 'DEV (opens in a new tab)' })
    expect(dev).toHaveAttribute('href', 'https://dev.to/someone/discussed-1a2b')
    expect(dev).toHaveAttribute('target', '_blank')
    expect(dev).toHaveAttribute('rel', 'noopener')
    expect(screen.getByRole('link', { name: 'Hacker News (opens in a new tab)' })).toHaveAttribute('href', 'https://news.ycombinator.com/item?id=1')
    expect(dev.closest('p')).toHaveTextContent(/^Discuss this post on DEV and Hacker News\.$/)
    expect(dev.closest('footer')).toBeTruthy()
  })

  it('has no discussion line when the post lists no thread, but still asks for feedback', async () => {
    vi.stubGlobal('fetch', fetchFor(QUIET))
    render(<BlogPost slug="quiet" />)
    const feedback = await screen.findByRole('link', { name: 'Send feedback' })
    expect(feedback).toHaveAttribute('href', '/contact/#feedback')
    expect(feedback.closest('p')).toHaveTextContent(/^Spotted a mistake\? Send feedback\.$/)
    expect(screen.queryByText(/Discuss this post/)).toBeNull()
  })

  it("opens the feedback form over the post as other feedback, leaving a modified click to reach the contact page's form", async () => {
    vi.stubGlobal('fetch', fetchFor(QUIET))
    const opened = vi.fn()
    window.addEventListener(EVENT_OPEN_FEEDBACK, opened)
    try {
      render(<BlogPost slug="quiet" />)
      const feedback = await screen.findByRole('link', { name: 'Send feedback' })
      expect(fireEvent.click(feedback, { ctrlKey: true })).toBe(true)
      expect(opened).not.toHaveBeenCalled()
      expect(fireEvent.click(feedback)).toBe(false)
      expect(opened).toHaveBeenCalledTimes(1)
      // a correction, not the form's default utility suggestion
      expect(opened.mock.calls[0][0].detail).toEqual({ kind: 'other' })
    } finally {
      window.removeEventListener(EVENT_OPEN_FEEDBACK, opened)
    }
  })
})

describe('parseTags', () => {
  it('reads a bracketed or bare list, unquoting items and dropping empty ones', () => {
    expect(parseTags('[base64, "encoding", \'cli\']')).toEqual(['base64', 'encoding', 'cli'])
    expect(parseTags('a, b,')).toEqual(['a', 'b'])
    expect(parseTags(undefined)).toEqual([])
    expect(parseTags('[]')).toEqual([])
  })
})

describe('discussLinks', () => {
  it('names each thread by its site, in the order listed, with the list syntax of tags', () => {
    const raw = '[https://dev.to/a/b-1c2d, "https://www.reddit.com/r/javascript/comments/abc/x/", https://news.ycombinator.com/item?id=1]'
    expect(discussLinks(raw)).toEqual([
      { href: 'https://dev.to/a/b-1c2d', label: 'DEV' },
      { href: 'https://www.reddit.com/r/javascript/comments/abc/x/', label: 'Reddit' },
      { href: 'https://news.ycombinator.com/item?id=1', label: 'Hacker News' },
    ])
    expect(discussLinks('https://old.reddit.com/r/webdev/comments/abc/x/')).toEqual([
      { href: 'https://old.reddit.com/r/webdev/comments/abc/x/', label: 'Reddit' },
    ])
    expect(discussLinks(undefined)).toEqual([])
    expect(discussLinks('[]')).toEqual([])
  })

  it('keeps only plain https links to a known site, so a link is never labelled with the wrong site', () => {
    for (const raw of ['http://dev.to/a', 'javascript:alert(1)', 'data:text/html,x', 'https://example.com/a', 'https://dev.to.example.com/a',
      'https://evil.example/dev.to', 'https://user:pw@dev.to/a', 'https://dev.to:8443/a', 'dev.to/a', '/blog/x/', 'not a url']) {
      expect(discussLinks(raw), raw).toEqual([])
    }
  })

  it('keeps the first thread on a site: two links reading "Reddit" would be indistinguishable', () => {
    expect(discussLinks('https://www.reddit.com/r/javascript/comments/a/x/, https://old.reddit.com/r/webdev/comments/b/y/')).toEqual([
      { href: 'https://www.reddit.com/r/javascript/comments/a/x/', label: 'Reddit' },
    ])
  })
})
