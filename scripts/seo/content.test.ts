import { describe, it, expect } from 'vitest'
import type { UtilityMeta } from '../../src/core/registry'
import {
  renderUtilityContent, renderUtilitiesIndexContent, renderBlogIndexContent,
  renderBlogPostContent, renderChangelogContent, renderSiteChrome, renderHomeContent,
  renderNotFoundContent, renderSitePageContent, renderDocsContent,
} from './content'

const XSS = '"><script>alert(1)</script>'

function meta(overrides: Partial<UtilityMeta> = {}): UtilityMeta {
  return {
    id: 'trim',
    name: 'trim',
    category: 'String Ops',
    description: 'Removes leading and trailing whitespace.',
    accepts: 'string',
    produces: 'string',
    params: {},
    tags: [],
    aliases: [],
    env: [],
    streamable: true,
    exampleCount: 0,
    ...overrides,
  }
}

describe('renderUtilityContent', () => {
  it('shows how to run the utility from the shell and from an agent, right after the header', () => {
    const html = renderUtilityContent(meta(), [], { guideHtml: '<p>guide</p>' })
    expect(html).toContain('npx subelt -i input.txt trim')
    expect(html).toContain('claude mcp add subelt -- npx -y @string-utility-belt/mcp')
    expect(html.indexOf('npx subelt')).toBeGreaterThan(html.indexOf('</header>'))
    expect(html.indexOf('npx subelt')).toBeLessThan(html.indexOf('<details>'))
  })

  it('leaves the command line out for a utility that needs a browser', () => {
    expect(renderUtilityContent(meta({ env: ['dom'] }), [])).not.toContain('npx subelt')
  })

  it('puts a supplied guide in a collapsed <details> with an h2 summary, after the header', () => {
    const html = renderUtilityContent(meta({ name: 'base64_encode' }), [], { guideHtml: '<h3 class="md-h2">What is Base64?</h3>' })
    expect(html).toContain('<details>')
    expect(html).not.toContain('<details open')
    expect(html).toContain('<summary><h2>How base64 encode works</h2>')
    expect(html).toContain('<h3 class="md-h2">What is Base64?</h3>')
    expect(html.indexOf('</header>')).toBeLessThan(html.indexOf('<details>'))
  })

  it('omits the guide section without a guide', () => {
    expect(renderUtilityContent(meta(), [])).not.toContain('<details')
  })

  it('links related utilities by crawlable path, escaping their text', () => {
    const html = renderUtilityContent(meta(), [], { related: [meta({ id: 'trim_lines', name: XSS, description: XSS })] })
    expect(html).toContain('<h2>Related utilities</h2>')
    expect(html).toContain('<a href="/util/trim_lines/">')
    expect(html).not.toContain('<script>alert(1)</script>')
  })

  it('includes name, category and description', () => {
    const html = renderUtilityContent(meta(), [])
    expect(html).toContain('trim')
    expect(html).toContain('String Ops')
    expect(html).toContain('Removes leading and trailing whitespace.')
  })

  it('escapes an attacker-controlled description/name so no tag is injected', () => {
    const html = renderUtilityContent(meta({ name: XSS, description: XSS }), [])
    expect(html).not.toContain('<script>alert(1)</script>')
  })

  it('renders a parameter table when params exist', () => {
    const html = renderUtilityContent(meta({
      params: { count: { kind: 'number', label: 'count', default: 1, min: 0, max: 10 } },
    }), [])
    expect(html).toContain('<table>')
    expect(html).toContain('count')
    expect(html).toContain('0–10')
  })

  it('renders examples and escapes their content', () => {
    const html = renderUtilityContent(meta(), [{ title: 'basic', input: XSS, output: 'ok' }])
    expect(html).toContain('basic')
    expect(html).not.toContain('<script>alert(1)</script>')
  })

  it('labels example inputs that are stored encoded (hex/base64 bytes), not plain text', () => {
    const html = renderUtilityContent(meta(), [
      { input: '1f8b08', inputEncoding: 'hex', output: 'x' },
      { input: 'plain', output: 'plain' },
    ])
    expect(html).toContain('<p>input (hex)</p>')
    expect(html.match(/<p>input<\/p>/g)).toHaveLength(1)
  })

  it('omits the params/examples sections when there are none', () => {
    const html = renderUtilityContent(meta(), [])
    expect(html).not.toContain('<table>')
    expect(html).not.toContain('<h2>Examples</h2>')
  })
})

describe('renderUtilitiesIndexContent', () => {
  it('groups utilities by category and links to their doc page', () => {
    const html = renderUtilitiesIndexContent([meta(), meta({ id: 'reverse', name: 'reverse', category: 'String Ops' })])
    expect(html).toContain('String Ops (2)')
    expect(html).toContain('/util/trim/')
    expect(html).toContain('/util/reverse/')
  })

  it('escapes a malicious utility name', () => {
    const html = renderUtilitiesIndexContent([meta({ name: XSS })])
    expect(html).not.toContain('<script>alert(1)</script>')
  })
})

describe('renderBlogIndexContent', () => {
  it('lists posts with a link and date', () => {
    const html = renderBlogIndexContent([{ slug: 'a', title: 'Post A', date: '2025-09-18', description: 'desc' }])
    expect(html).toContain('/blog/a/')
    expect(html).toContain('Post A')
    expect(html).toContain('2025-09-18')
  })

  it('shows an empty state with no posts', () => {
    expect(renderBlogIndexContent([])).toContain('No posts yet.')
  })

  it('escapes a malicious post title', () => {
    const html = renderBlogIndexContent([{ slug: 'a', title: XSS }])
    expect(html).not.toContain('<script>alert(1)</script>')
  })
})

describe('renderBlogPostContent', () => {
  it('wraps the pre-rendered body and escapes the frontmatter title', () => {
    const html = renderBlogPostContent({ title: XSS, date: '2025-09-18' }, '<p class="md-p">safe body</p>')
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('safe body')
  })
})

describe('renderChangelogContent', () => {
  it('wraps pre-rendered changelog HTML without adding a second h1 (the markdown has its own)', () => {
    const html = renderChangelogContent('<h1 class="md-h1">Changelog</h1><p class="md-p">x</p>')
    expect(html).toContain('<h1 class="md-h1">Changelog</h1>')
    expect(html.match(/<h1/g)).toHaveLength(1)
  })
})

describe('renderSiteChrome', () => {
  it("wraps a page's content in the app's header nav and footer, as plain crawlable links", () => {
    const html = renderSiteChrome('<article>body</article>', 2026)
    expect(html).toContain('<main><article>body</article></main>')
    for (const href of ['/', '/docs/', '/utilities/', '/blog/', '/changelog/', '/about/', '/privacy/', '/contact/']) {
      expect(html).toContain(`<a href="${href}">`)
    }
    expect(html).toContain('© 2026 String Utility Belt')
    expect(html.indexOf('<header>')).toBeLessThan(html.indexOf('<main>'))
    expect(html.indexOf('</main>')).toBeLessThan(html.indexOf('<footer>'))
  })
})

describe('renderHomeContent', () => {
  it('links the popular utilities that exist, and the full list', () => {
    const html = renderHomeContent([meta({ id: 'base64_encode', name: 'base64_encode' }), meta({ id: 'trim' })])
    expect(html).toContain('<a href="/util/base64_encode/">base64 encode</a>')
    // trim is not a popular utility; missing popular ids are skipped
    expect(html).not.toContain('/util/trim/')
    expect(html).not.toContain('/util/url_encode/')
    expect(html).toContain('<a href="/utilities/">Browse all 2 utilities</a>')
  })

  it('escapes utility text', () => {
    expect(renderHomeContent([meta({ id: 'base64_encode', name: XSS, description: XSS })])).not.toContain('<script>alert(1)</script>')
  })
})

describe('renderDocsContent', () => {
  it('renders the usage guide component: one heading, every section, crawlable path links only', () => {
    const doc = new DOMParser().parseFromString(renderDocsContent(), 'text/html')
    expect([...doc.querySelectorAll('h1')].map(h => h.textContent)).toEqual(['How to use String Utility Belt'])
    const sections = [...doc.querySelectorAll('section[id]')].map(s => s.id)
    expect(sections).toEqual(expect.arrayContaining(['pipeline', 'steps', 'output', 'utilities']))
    // the section nav's entries point at its sections
    expect(doc.querySelectorAll('nav[aria-label="Docs sections"] a')).toHaveLength(sections.length)
    const hrefs = [...doc.querySelectorAll('a')].map(a => a.getAttribute('href'))
    // the section links are plain in-page anchors, so they work before (or without) the app's script
    expect(hrefs).toEqual(expect.arrayContaining(['/', '/utilities/', '/docs/#pipeline']))
    expect(hrefs.filter(h => !h?.startsWith('/'))).toEqual([])
  })
})

describe('renderNotFoundContent / renderSitePageContent', () => {
  it('gives a 404 its own heading and ways back into the site', () => {
    const html = renderNotFoundContent()
    expect(html).toContain('<h1>Page not found</h1>')
    expect(html).toContain('<a href="/utilities/">')
  })

  it('wraps a site page body as is', () => {
    expect(renderSitePageContent('<h1 class="md-h1">About</h1>')).toBe('<article><h1 class="md-h1">About</h1></article>')
  })
})

describe('renderUtilityContent names', () => {
  it('spaces out a legacy id-as-name in the heading (when no guide names it) and related links', () => {
    const html = renderUtilityContent(meta({ id: 'legacy_util', name: 'legacy_util' }), [], { related: [meta({ id: 'base64_decode', name: 'base64_decode' })] })
    expect(html).toContain('<h1>legacy util</h1>')
    expect(html).toContain('<a href="/util/base64_decode/">base64 decode</a>')
  })

  it('links the blog posts about the utility', () => {
    const html = renderUtilityContent(meta({ id: 'md5', name: 'md5 hash' }), [])
    expect(html).toContain('<h2>From the blog</h2>')
    expect(html).toContain('<a href="/blog/md5-insecure-but-useful/">')
    expect(renderUtilityContent(meta({ id: 'atbash', name: 'atbash' }), [])).not.toContain('From the blog')
  })

  it("heads a utility page with its guide title's search term", () => {
    expect(renderUtilityContent(meta({ id: 'base64_encode', name: 'base64_encode' }), [])).toContain('<h1>Base64 Encode</h1>')
  })
})

describe('renderBlogPostContent dates', () => {
  it('shows an update date only when it differs from the publish date', () => {
    expect(renderBlogPostContent({ title: 't', date: '2025-09-18', updated: '2026-09-25' }, '')).toContain('Updated <time datetime="2026-09-25">')
    expect(renderBlogPostContent({ title: 't', date: '2025-09-18', updated: '2025-09-18' }, '')).not.toContain('Updated')
  })
})
