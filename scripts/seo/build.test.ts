import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync, copyFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { UtilityMeta } from '../../src/core/registry'
import { MANIFEST } from '../../src/utilities/_generated/manifest'
import { buildRssItems, buildSeo, SITE } from './build'
import { parseGuide } from '../../src/app/pages/guide'
import { POPULAR_UTILITY_IDS, DOCS_DESCRIPTION, DOCS_TITLE, displayName, homeDescription, pageTitle } from '../../src/app/pages/seo'
import { SITE_PAGES } from '../../src/lib/router'
import { INTEGRATION_LINKS } from '../../src/app/integrations/links'
import { resolveOg, resolveOutDir } from '../build-seo'
import { STATIC_PRESETS } from '../../src/presets/_generated/static'
import { step } from '../../src/presets/define'
import { TRACE_ELEMENT_ID, type PresetTrace } from '../../src/presets/trace'
import type { Preset } from '../../src/presets/types'
import { metaOfPreset } from '../gen-presets'
import { readSourceDates, type SourceDates } from './lastmod'
import type { Sponsorship } from '../../src/app/sponsors/sponsors'
import { promoPlan } from '../../src/app/sponsors/promos'
import { GITHUB_SPONSORS_URL } from '../../src/app/support'

const ROOT = process.cwd()
const NOW = new Date('2026-01-02T03:04:05Z')
const XSS = `"><script>alert(1)</script> $' $& $$`

/** Shaped like Vite's built index.html: description meta, title, empty #root, module script. */
const TEMPLATE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="description" content="String Pipeline Workshop &amp; friends — chain elegant string utilities with previews." />
  <title>String Utility Belt</title>
  <script type="module" crossorigin src="/assets/index-abc123.js"></script>
</head>
<body class="min-h-screen">
  <div id="root"></div>
</body>
</html>
`

const tmpDirs: string[] = []

function fixtureDist(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'build-seo-'))
  tmpDirs.push(dir)
  writeFileSync(path.join(dir, 'index.html'), TEMPLATE)
  const blog = path.join(dir, 'blog')
  mkdirSync(blog)
  const shipped = JSON.parse(readFileSync(path.join(ROOT, 'public', 'blog', '_manifest.json'), 'utf8'))
  for (const post of shipped) copyFileSync(path.join(ROOT, 'public', 'blog', `${post.slug}.md`), path.join(blog, `${post.slug}.md`))
  writeFileSync(path.join(blog, '_manifest.json'), JSON.stringify([
    ...shipped,
    { slug: 'no-markdown-file', title: 'Ghost post', date: '2025-10-01' },
    { slug: '../../escape', title: 'Traversal', date: '2025-10-01' },
  ]))
  return dir
}

const read = (dir: string, rel: string) => readFileSync(path.join(dir, rel), 'utf8')
const html = (source: string) => new DOMParser().parseFromString(source, 'text/html')
const xml = (source: string) => {
  const doc = new DOMParser().parseFromString(source, 'application/xml')
  expect(doc.getElementsByTagName('parsererror')).toHaveLength(0)
  return doc
}
/** Each sitemap URL's lastmod, by URL. */
const sitemapLastmods = (dist: string) => new Map([...xml(read(dist, 'sitemap.xml')).getElementsByTagName('url')]
  .map(u => [u.getElementsByTagName('loc')[0].textContent!, u.getElementsByTagName('lastmod')[0]?.textContent]))
const silent = () => {}
/** The shipped `src/utilities/<id>/guide.md`, parsed, when there is one. */
const shippedGuide = (id: string) => {
  const file = path.join(ROOT, 'src', 'utilities', id, 'guide.md')
  return existsSync(file) ? parseGuide(readFileSync(file, 'utf8')) : undefined
}

afterAll(() => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true })
})

describe('buildSeo utility guides', () => {
  const GUIDE = [
    '---', 'title: Trim Whitespace Online: Strip Spaces', 'description: Strip leading and trailing whitespace. $& $$', '---',
    '## What it removes', '', `Everything ${XSS}`, '',
    '```example', 'input:   padded', 'output: padded', '```',
  ].join('\n')
  const trim = MANIFEST.find(m => m.id === 'trim')!
  const pad = MANIFEST.find(m => m.id === 'pad')!
  let dist: string
  const logs: string[] = []

  beforeAll(async () => {
    dist = fixtureDist()
    await buildSeo({ outDir: dist, root: ROOT, og: false, now: NOW, log: m => logs.push(m), manifest: [trim, pad], examples: {}, guides: { trim: GUIDE } })
  }, 60000)

  it("takes the page title and description from the guide's frontmatter", () => {
    const doc = html(read(dist, 'util/trim/index.html'))
    expect(doc.title).toBe('Trim Whitespace Online: Strip Spaces | String Utility Belt')
    expect(doc.querySelector('meta[name="description"]')?.getAttribute('content')).toBe('Strip leading and trailing whitespace. $& $$')
    expect(doc.querySelector('meta[property="og:title"]')?.getAttribute('content')).toBe('Trim Whitespace Online: Strip Spaces | String Utility Belt')
    const ld = JSON.parse(doc.querySelector('script[type="application/ld+json"]')!.textContent!)
    expect(ld.description).toBe('Strip leading and trailing whitespace. $& $$')
  })

  it('pre-renders the guide in a collapsed <details> under an h2, escaped', () => {
    const source = read(dist, 'util/trim/index.html')
    expect(source).not.toContain('<script>alert(1)</script>')
    const details = html(source).querySelector('#root details')!
    expect(details.hasAttribute('open')).toBe(false)
    expect(details.querySelector('summary h2')?.textContent).toBe('How trim works')
    expect(details.querySelector('h3')?.textContent).toBe('What it removes')
    expect(details.querySelector('figure.guide-example')?.textContent).toContain('padded')
  })

  it('falls back to the utility name/description, with no guide section, when there is no guide', () => {
    const doc = html(read(dist, 'util/pad/index.html'))
    expect(doc.title).toBe(`${pad.name} | String Utility Belt`)
    expect(doc.querySelector('#root details')).toBeNull()
    expect(logs).toContain('[build-seo] warning: 1 of 2 utilities have no guide.md')
  })
})

describe('buildSeo over a built dist/', () => {
  let dist: string
  let result: Awaited<ReturnType<typeof buildSeo>>
  const logs: string[] = []

  beforeAll(async () => {
    dist = fixtureDist()
    result = await buildSeo({ outDir: dist, root: ROOT, og: false, now: NOW, log: m => logs.push(m) })
  }, 60000)

  it('writes one crawlable page per utility and preset, plus the indexes, blog, changelog, docs, site pages and 404', () => {
    const utilDirs = readdirSync(path.join(dist, 'util'))
    expect(utilDirs.sort()).toEqual(MANIFEST.map(m => m.id).sort())
    const presetDirs = readdirSync(path.join(dist, 'presets')).filter(f => f !== 'index.html')
    expect(presetDirs.sort()).toEqual(STATIC_PRESETS.map(r => r.slug).sort())
    for (const rel of ['utilities/index.html', 'presets/index.html', 'blog/index.html', 'changelog/index.html', 'docs/index.html',
      'blog/base64-encode-decode-online/index.html', 'blog/md5-insecure-but-useful/index.html',
      'about/index.html', 'privacy/index.html', 'contact/index.html', 'integrations/index.html', 'advertise/index.html', '404.html']) {
      expect(existsSync(path.join(dist, rel)), rel).toBe(true)
    }
    expect(result.pages).toBe(MANIFEST.length + STATIC_PRESETS.length + 13)
  })

  it('gives every utility page exactly one title and canonical, and JSON-LD that parses', () => {
    // string-level over all pages (a jsdom parse of every page takes ~15s)
    for (const meta of MANIFEST) {
      const source = read(dist, `util/${meta.id}/index.html`)
      expect(source.match(/<title>/g), meta.id).toHaveLength(1)
      expect(source.match(/rel="canonical"/g), meta.id).toHaveLength(1)
      expect(source).toContain(`<link rel="canonical" href="${SITE}/util/${meta.id}/">`)
      const ld = [...source.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]))
      expect(ld.map(d => d['@type']), meta.id).toEqual(['WebApplication', 'BreadcrumbList'])
    }
  })

  it('fills utility pages with the right metadata and static content (DOM-parsed sample)', () => {
    const sample = MANIFEST.filter((_, i) => i % 25 === 0).concat(MANIFEST.filter(m => /tabs_spaces|trim|aes_decrypt/.test(m.id)))
    for (const meta of sample) {
      const doc = html(read(dist, `util/${meta.id}/index.html`))
      const guide = shippedGuide(meta.id)
      expect(doc.title).toBe(pageTitle(guide?.title ?? displayName(meta.name)))
      expect(doc.title.length <= 60 || doc.title === guide?.title, meta.id).toBe(true)
      const canonicals = doc.querySelectorAll('link[rel="canonical"]')
      expect(canonicals, meta.id).toHaveLength(1)
      expect(canonicals[0].getAttribute('href')).toBe(`${SITE}/util/${meta.id}/`)
      expect(doc.querySelector('meta[property="og:image"]')?.getAttribute('content')).toBe(`${SITE}/og/${meta.id}.png`)
      expect(doc.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(guide?.description ?? meta.description)
      expect(!!doc.querySelector('#root details'), meta.id).toBe(!!guide)
      const ld = [...doc.querySelectorAll('script[type="application/ld+json"]')].map(s => JSON.parse(s.textContent!))
      expect(ld.map(d => d['@type'])).toEqual(['WebApplication', 'BreadcrumbList'])
      expect(ld[0].name).toBe(displayName(meta.name))
      expect(doc.querySelector('#root h1')?.textContent).toBe(displayName(meta.name))
    }
  })

  it('links related utilities by their crawlable /util/<id>/ paths', () => {
    const doc = html(read(dist, 'util/url_decode/index.html'))
    const related = [...doc.querySelectorAll('#root section')].find(s => s.querySelector('h2')?.textContent === 'Related utilities')!
    const hrefs = [...related.querySelectorAll('a')].map(a => a.getAttribute('href'))
    expect(hrefs[0]).toBe('/util/url_encode/')
    expect(hrefs.every(h => /^\/util\/[a-z0-9_]+\/$/.test(h!))).toBe(true)
  })

  it('keeps the built app script so React mounts over the static content', () => {
    const doc = html(read(dist, 'util/trim/index.html'))
    expect(doc.querySelector('script[type="module"]')?.getAttribute('src')).toBe('/assets/index-abc123.js')
  })

  it('gives the home page its title, RSS discovery, canonical, default OG and site-name JSON-LD', () => {
    const doc = html(read(dist, 'index.html'))
    expect(doc.title).toBe('Free Online String & Text Tools | String Utility Belt')
    expect(doc.querySelector('link[rel="alternate"][type="application/rss+xml"]')?.getAttribute('href')).toBe(`${SITE}/rss.xml`)
    expect(doc.querySelectorAll('link[rel="canonical"]')).toHaveLength(1)
    expect(doc.querySelector('meta[property="og:image"]')?.getAttribute('content')).toBe(`${SITE}/og/default.png`)
    expect(doc.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(homeDescription(MANIFEST.length))
    expect(doc.querySelector('meta[property="og:description"]')?.getAttribute('content')).toBe(homeDescription(MANIFEST.length))
    const ld = [...doc.querySelectorAll('script[type="application/ld+json"]')].map(s => JSON.parse(s.textContent!))
    expect(ld.map(d => d['@type'])).toEqual(['WebSite', 'WebApplication'])
    expect(ld[0]).toMatchObject({ name: 'String Utility Belt', url: `${SITE}/` })
  })

  it('pre-renders the home page with crawlable links to the popular utilities', () => {
    const doc = html(read(dist, 'index.html'))
    expect(doc.querySelector('#root h1')?.textContent).toBe('String Utility Belt')
    const hrefs = [...doc.querySelectorAll('#root main a')].map(a => a.getAttribute('href'))
    expect(hrefs).toEqual(expect.arrayContaining(POPULAR_UTILITY_IDS.map(id => `/util/${id}/`)))
    expect(hrefs).toContain('/utilities/')
  })

  it('surrounds every pre-rendered page with the site nav and footer links', () => {
    for (const rel of ['index.html', 'util/trim/index.html', 'utilities/index.html', 'presets/index.html', 'blog/index.html', 'changelog/index.html', 'docs/index.html', 'privacy/index.html', '404.html']) {
      const doc = html(read(dist, rel))
      const footer = [...doc.querySelectorAll('#root footer a')].map(a => a.getAttribute('href'))
      expect(footer, rel).toEqual(['/utilities/', '/presets/', '/blog/', '/changelog/', '/integrations/', '/about/', '/privacy/', '/contact/', '/advertise/',
        GITHUB_SPONSORS_URL])
      expect([...doc.querySelectorAll('#root > header nav[aria-label="main"] a')].map(a => a.getAttribute('href')), rel)
        .toEqual(['/', '/docs/', '/utilities/', '/presets/', '/blog/', '/changelog/'])
      expect([...doc.querySelectorAll('#root > header nav[aria-label="Integrations"] a')].map(a => a.getAttribute('href')), rel)
        .toEqual(INTEGRATION_LINKS.map(l => l.href))
    }
  })

  it('pre-renders the usage guide from the Docs component, with the head the app sets at runtime', () => {
    const doc = html(read(dist, 'docs/index.html'))
    expect(doc.title).toBe(DOCS_TITLE)
    expect(doc.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(DOCS_DESCRIPTION)
    expect(doc.querySelectorAll('link[rel="canonical"]')).toHaveLength(1)
    expect(doc.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(`${SITE}/docs/`)
    expect(doc.querySelector('meta[property="og:image"]')?.getAttribute('content')).toBe(`${SITE}/og/default.png`)
    const ld = [...doc.querySelectorAll('script[type="application/ld+json"]')].map(s => JSON.parse(s.textContent!))
    expect(ld).toEqual([expect.objectContaining({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: 'Docs', item: `${SITE}/docs/` },
      ],
    })])
    const main = doc.querySelector('#root main')!
    expect([...main.querySelectorAll('h1')].map(h => h.textContent)).toEqual(['How to use String Utility Belt'])
    expect(main.querySelector('section#utilities h2')?.textContent).toBe('Utility reference')
    // crawlable paths only: no #/ route links left in the static page
    const hrefs = [...doc.querySelectorAll('#root a')].map(a => a.getAttribute('href'))
    expect(hrefs).toEqual(expect.arrayContaining(['/', '/utilities/']))
    expect(hrefs.filter(h => h?.includes('#/'))).toEqual([])
    expect(doc.querySelector('script[type="module"]')?.getAttribute('src')).toBe('/assets/index-abc123.js')
  })

  it('pre-renders the integrations sections the header links open', () => {
    const doc = html(read(dist, 'integrations/index.html'))
    for (const { href, external } of INTEGRATION_LINKS) {
      if (external) continue
      const [pathname, id] = href.split('#')
      expect(pathname, href).toBe('/integrations/')
      expect(doc.querySelector(`#root main h2[id="${id}"]`), href).not.toBeNull()
    }
  })

  it('pre-renders the about, privacy, contact, integrations and advertise pages from their markdown', () => {
    for (const slug of SITE_PAGES) {
      const doc = html(read(dist, `${slug}/index.html`))
      expect(doc.querySelector('link[rel="canonical"]')?.getAttribute('href'), slug).toBe(`${SITE}/${slug}/`)
      expect(doc.querySelectorAll('#root h1'), slug).toHaveLength(1)
      expect(doc.querySelector('meta[name="description"]')?.getAttribute('content')?.length, slug).toBeGreaterThanOrEqual(80)
      const ld = [...doc.querySelectorAll('script[type="application/ld+json"]')].map(s => JSON.parse(s.textContent!))
      expect(ld.map(d => d['@type'])[1], slug).toBe('BreadcrumbList')
    }
    expect(html(read(dist, 'privacy/index.html')).title).toBe('Privacy Policy | String Utility Belt')
    // what leaves the browser: no cookies, Cloudflare's cookieless page counts
    const privacy = html(read(dist, 'privacy/index.html')).querySelector('#root main')!
    expect(privacy.textContent).toContain('The site sets no cookies.')
    expect([...privacy.querySelectorAll('a')].map(a => a.getAttribute('href'))).toContain('https://www.cloudflare.com/privacypolicy/')
  })

  it('writes a 404 page that is kept out of the index and links back into the site', () => {
    const doc = html(read(dist, '404.html'))
    expect(doc.title).toBe('Page not found | String Utility Belt')
    expect(doc.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex')
    expect(doc.querySelector('link[rel="canonical"]')).toBeNull()
    expect(doc.querySelector('#root h1')?.textContent).toBe('Page not found')
    expect(doc.querySelector('script[type="module"]')?.getAttribute('src')).toBe('/assets/index-abc123.js')
  })

  it('skips manifest posts that have no markdown or an unsafe slug — no dead URLs anywhere', () => {
    expect(existsSync(path.join(dist, 'blog', 'no-markdown-file'))).toBe(false)
    expect(existsSync(path.join(dist, '..', 'escape'))).toBe(false)
    expect(logs.some(l => l.includes('no-markdown-file'))).toBe(true)
    for (const file of ['sitemap.xml', 'rss.xml', 'blog/index.html']) {
      expect(read(dist, file), file).not.toContain('no-markdown-file')
      expect(read(dist, file), file).not.toContain('Traversal')
      expect(read(dist, file), file).not.toContain('../')
    }
  })

  it('renders each blog post title once (the body’s repeated "# Title" is dropped)', () => {
    const doc = html(read(dist, 'blog/md5-insecure-but-useful/index.html'))
    expect(doc.querySelectorAll('#root h1')).toHaveLength(1)
    expect(doc.querySelector('meta[property="og:type"]')?.getAttribute('content')).toBe('article')
  })

  it('marks blog posts up as BlogPosting with their dates', () => {
    const doc = html(read(dist, 'blog/md5-insecure-but-useful/index.html'))
    const ld = [...doc.querySelectorAll('script[type="application/ld+json"]')].map(s => JSON.parse(s.textContent!))
    expect(ld.map(d => d['@type'])).toEqual(['BlogPosting', 'BreadcrumbList'])
    expect(ld[0]).toMatchObject({ datePublished: '2025-09-18', url: `${SITE}/blog/md5-insecure-but-useful/` })
    expect(ld[0].headline).toBe(doc.querySelector('#root h1')?.textContent)
    expect(doc.querySelector('meta[property="article:published_time"]')?.getAttribute('content')).toBe('2025-09-18')
  })

  it('pre-renders the changelog with real lists', () => {
    const doc = html(read(dist, 'changelog/index.html'))
    expect([...doc.querySelectorAll('#root h1')].map(h => h.textContent)).toEqual(['Changelog'])
    expect(doc.querySelectorAll('#root li').length).toBeGreaterThanOrEqual(5)
    expect(doc.querySelector('#root h2')?.textContent).toBe('Unreleased')
  })

  it('writes a well-formed sitemap listing every published page', () => {
    const doc = xml(read(dist, 'sitemap.xml'))
    const locs = [...doc.getElementsByTagName('loc')].map(l => l.textContent)
    expect(locs).toHaveLength(result.sitemapUrls)
    expect(locs).toEqual(expect.arrayContaining([
      `${SITE}/`, `${SITE}/docs/`, `${SITE}/utilities/`, `${SITE}/util/trim/`, `${SITE}/blog/`,
      `${SITE}/blog/md5-insecure-but-useful/`, `${SITE}/changelog/`,
      `${SITE}/about/`, `${SITE}/privacy/`, `${SITE}/contact/`, `${SITE}/integrations/`, `${SITE}/advertise/`, `${SITE}/presets/`,
      ...STATIC_PRESETS.map(r => `${SITE}/presets/${r.slug}/`),
    ]))
    // every page `pages` counts but the 404, plus the home page (written apart from the count)
    expect(locs).toHaveLength(result.pages - 1 + 1)
    expect(locs).not.toContain(`${SITE}/404.html`)
    expect(locs.filter(l => l?.startsWith(`${SITE}/util/`))).toHaveLength(MANIFEST.length)
    const lastmods = [...doc.getElementsByTagName('lastmod')].map(l => l.textContent)
    expect(lastmods.every(d => /^\d{4}-\d{2}-\d{2}$/.test(d ?? '') && d !== '1970-01-01')).toBe(true)
  })

  it('writes a well-formed RSS feed: posts and releases, dated newest first, no invented dates or empty items', () => {
    const doc = xml(read(dist, 'rss.xml'))
    const items = [...doc.getElementsByTagName('item')].map(item => ({
      title: item.getElementsByTagName('title')[0].textContent,
      pubDate: item.getElementsByTagName('pubDate')[0]?.textContent,
      guid: item.getElementsByTagName('guid')[0].textContent,
    }))
    const shipped: Array<{ title: string }> = JSON.parse(read(ROOT, 'public/blog/_manifest.json'))
    // The real CHANGELOG's "Unreleased" section fills up between releases (every PR adds to it), so its
    // item comes and goes; buildRssItems' own tests cover when it appears and how it is dated.
    // Every release adds an item at the top, so the expected releases come from the changelog itself.
    const released = items.filter(i => i.title !== 'Unreleased changes')
    const versions = [...read(ROOT, 'CHANGELOG.md').matchAll(/^## \[(\d[^\]]*)\]/gm)].map(m => `Release ${m[1]}`)
    expect(versions).toEqual(expect.arrayContaining(['Release 1.4.0', 'Release 1.3.0']))
    expect(released.map(i => i.title).sort()).toEqual([...shipped.map(p => p.title), ...versions].sort())
    // dated items come newest first, with the changelog's own date
    const dates = released.filter(i => i.pubDate).map(i => Date.parse(i.pubDate!))
    expect(dates).toEqual([...dates].sort((a, b) => b - a))
    expect(released.find(i => i.title === 'Release 1.4.0')?.pubDate).toBe(new Date('2026-10-06T00:00:00Z').toUTCString())
    // undated release: last, with no pubDate rather than the build date or the epoch
    const oldest = released[released.length - 1]
    expect(oldest.title).toBe('Release 1.3.0')
    expect(oldest.pubDate).toBeUndefined()
    expect(oldest.guid).toBe('tag:stringutilitybelt.com,2025:changelog/1.3.0')
  })

  it('dates the sitemap by content, not the build: a later build of the same commit writes the same sitemap', async () => {
    // this checkout's real history; a file not committed yet (a new page in a working tree) is
    // dated by the build by design, so it gets a fixed date here instead
    const history = readSourceDates(ROOT, { fallback: '2000-01-01' })
    const sourceDates: SourceDates = paths => history(paths) ?? '2000-01-01'
    const [first, later] = [fixtureDist(), fixtureDist()]
    await buildSeo({ outDir: first, root: ROOT, og: false, now: NOW, log: silent, sourceDates })
    await buildSeo({ outDir: later, root: ROOT, og: false, now: new Date('2027-06-30T23:59:59Z'), log: silent, sourceDates })
    expect(read(later, 'sitemap.xml')).toBe(read(first, 'sitemap.xml'))
  }, 60000)

  it('is idempotent: a second run over its own output changes nothing', async () => {
    const files = ['index.html', 'util/trim/index.html', 'changelog/index.html', 'docs/index.html', 'sitemap.xml', 'rss.xml']
    const before = files.map(f => read(dist, f))
    await buildSeo({ outDir: dist, root: ROOT, og: false, now: NOW, log: silent })
    const after = files.map(f => read(dist, f))
    expect(after).toEqual(before)
    expect(html(after[1]).querySelectorAll('link[rel="canonical"]')).toHaveLength(1)
  }, 60000)
})

describe('buildSeo sponsorships', () => {
  const pick = (id: string) => MANIFEST.find(m => m.id === id)!
  const saml = STATIC_PRESETS.find(r => r.slug === 'decode-saml-request')!
  const samlGuide = readFileSync(path.join(ROOT, 'src', 'presets', saml.slug, 'guide.md'), 'utf8')
  const live = { start: '2026-01-01', end: '2026-01-31' }
  const sponsorships: Sponsorship[] = [
    { id: 'auth-jan', scope: 'auth-tokens', name: 'AuthCo', text: `Tokens ${XSS}`, url: 'https://auth.example/', logo: 'auth.svg', ...live },
    { id: 'site-jan', scope: 'site', name: 'SiteCo', text: 'Everywhere else.', url: 'https://site.example/', logo: 'site.png', ...live },
    { id: 'kube-dec', scope: 'kubernetes-cloud', name: 'Old', text: 'Expired.', url: 'https://old.example/', logo: 'old.svg', start: '2025-12-01', end: '2026-01-01' },
  ]
  let dist: string

  beforeAll(async () => {
    dist = fixtureDist()
    await buildSeo({
      outDir: dist, root: ROOT, og: false, now: NOW, log: silent, sponsorships,
      manifest: [pick('jwt_decode'), pick('trim'), pick('cron_describe')], examples: {}, guides: {},
      presets: [{ preset: saml, guide: samlGuide }],
    })
  }, 60000)

  const sponsorOn = (rel: string) => html(read(dist, rel)).querySelector('#root main aside[aria-label="Sponsor"]')

  it("pre-renders each page's sponsor on the build's day: topic first, then site-wide", () => {
    expect(sponsorOn('util/jwt_decode/index.html')?.getAttribute('data-sponsorship')).toBe('auth-jan')
    expect(sponsorOn('presets/decode-saml-request/index.html')?.getAttribute('data-sponsorship')).toBe('auth-jan')
    expect(sponsorOn('util/trim/index.html')?.getAttribute('data-sponsorship')).toBe('site-jan')
    // its topic's booking ended before the build day, so the site-wide sponsor holds it
    expect(sponsorOn('util/cron_describe/index.html')?.getAttribute('data-sponsorship')).toBe('site-jan')
    expect(sponsorOn('blog/md5-insecure-but-useful/index.html')?.getAttribute('data-sponsorship')).toBe('site-jan')
  })

  it('renders the block in the page header, escaped, with a plain sponsored link', () => {
    const source = read(dist, 'util/jwt_decode/index.html')
    expect(source).not.toContain('<script>alert(1)</script>')
    const block = sponsorOn('util/jwt_decode/index.html')!
    expect(block.closest('header')).toBeTruthy()
    const link = block.querySelector('a[rel="sponsored noopener"]')!
    expect(link.getAttribute('href')).toBe(
      'https://auth.example/?utm_source=stringutilitybelt&utm_medium=sponsorship&utm_campaign=auth-jan&utm_content=util%2Fjwt_decode')
    expect(link.textContent).toContain(`Tokens ${XSS}`)
    expect(block.querySelector('img')?.getAttribute('src')).toBe('/sponsors/auth.svg')
  })

  it('never puts a sponsor on the tool or the index and site pages', () => {
    for (const rel of ['index.html', 'utilities/index.html', 'presets/index.html', 'blog/index.html', 'docs/index.html',
      'about/index.html', 'advertise/index.html', 'changelog/index.html', '404.html']) {
      expect(sponsorOn(rel), rel).toBeNull()
    }
  })
})

describe('buildSeo presets', () => {
  const GUIDE = [
    '---', 'title: Shout a List of Titles as Slugs Online', `description: Uppercase slugs from titles ${XSS}, with accents removed and punctuation collapsed into hyphens.`, '---',
    '## Why', '', `Prose ${XSS}`, '',
    '## How', '', 'Uses [change case](/util/case/).',
  ].join('\n')
  const preset: Preset = {
    slug: 'shout-slugs',
    name: `Shout slugs ${XSS}`,
    summary: `Turn titles into uppercase slugs ${XSS}.`,
    category: 'Writing & Marketing',
    primaryQuery: 'shout slugs',
    published: '2026-05-01',
    updated: '2026-06-02',
    steps: [
      step('accents', 'diacritics', {}, 'Accented letters would otherwise be dropped by the next step.'),
      step('hyphens', 'replace', { pattern: '[^A-Za-z0-9\\n]+', replacement: '-', regex: true, flags: 'g' }, `Collapses punctuation ${XSS}.`),
      step('upper', 'case', { mode: 'upper' }, 'Uppercases every letter.'),
    ],
    samples: [
      { id: 'titles', title: 'Titles', input: 'Café au lait\n<b>Two</b>', output: 'CAFE-AU-LAIT\n-B-TWO-B-' },
      { id: 'other', title: 'Other', input: 'x y', output: 'X-Y' },
    ],
  }
  let dist: string
  let result: Awaited<ReturnType<typeof buildSeo>>

  beforeAll(async () => {
    dist = fixtureDist()
    result = await buildSeo({ outDir: dist, root: ROOT, og: false, now: NOW, log: silent, presets: [{ preset, guide: GUIDE }] })
  }, 60000)

  it("takes the page head from the guide's frontmatter, as an article with its dates", () => {
    const source = read(dist, 'presets/shout-slugs/index.html')
    const doc = html(source)
    expect(doc.title).toBe(pageTitle('Shout a List of Titles as Slugs Online'))
    expect(doc.querySelector('meta[name="description"]')?.getAttribute('content')).toContain(XSS)
    expect(source.match(/rel="canonical"/g)).toHaveLength(1)
    expect(doc.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(`${SITE}/presets/shout-slugs/`)
    expect(doc.querySelector('meta[property="og:type"]')?.getAttribute('content')).toBe('article')
    expect(doc.querySelector('meta[property="og:image"]')?.getAttribute('content')).toBe(`${SITE}/og/presets/shout-slugs.png`)
    expect(doc.querySelector('meta[property="article:published_time"]')?.getAttribute('content')).toBe('2026-05-01')
    expect(doc.querySelector('meta[property="article:modified_time"]')?.getAttribute('content')).toBe('2026-06-02')
  })

  it('marks it up as a TechArticle about the utilities it uses, with breadcrumbs', () => {
    const source = read(dist, 'presets/shout-slugs/index.html')
    const ld = [...source.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]))
    const article = ld.find(x => x['@type'] === 'TechArticle')
    expect(article).toMatchObject({ headline: preset.name, url: `${SITE}/presets/shout-slugs/`, datePublished: '2026-05-01', dateModified: '2026-06-02' })
    expect(article.about.map((a: { url: string }) => a.url).sort()).toEqual(['case', 'diacritics', 'replace'].map(id => `${SITE}/util/${id}/`))
    const crumbs = ld.find(x => x['@type'] === 'BreadcrumbList')
    expect(crumbs.itemListElement.map((i: { item: string }) => i.item)).toEqual([`${SITE}/`, `${SITE}/presets/`, `${SITE}/presets/shout-slugs/`])
  })

  it('embeds the worked example trace for the app, escaped', () => {
    const source = read(dist, 'presets/shout-slugs/index.html')
    expect(source).not.toContain('<b>Two</b>')
    const doc = html(source)
    const trace = JSON.parse(doc.getElementById(TRACE_ELEMENT_ID)!.textContent!) as PresetTrace
    expect(trace).toMatchObject({ slug: 'shout-slugs', sampleId: 'titles', output: 'CAFE-AU-LAIT\n-B-TWO-B-' })
    expect(trace.steps.map(s => s.output?.text)).toEqual(['Cafe au lait\n<b>Two</b>', 'Cafe-au-lait\n-b-Two-b-', 'CAFE-AU-LAIT\n-B-TWO-B-'])
    expect(trace.skip.map(s => s.id)).toEqual(['accents', 'hyphens', 'upper'])
    expect(doc.head.querySelector(`#${TRACE_ELEMENT_ID}`)).toBeTruthy()
  })

  it('pre-renders the page itself: heading, live example, every step with its output, the guide', () => {
    const doc = html(read(dist, 'presets/shout-slugs/index.html'))
    const main = doc.querySelector('#root main')!
    expect(main.querySelectorAll('h1')).toHaveLength(1)
    expect(main.querySelector('h1')?.textContent).toBe(preset.name)
    expect(main.querySelector('textarea')?.textContent).toBe('Café au lait\n<b>Two</b>')
    expect(main.querySelector('pre[role="status"]')?.textContent).toBe('CAFE-AU-LAIT\n-B-TWO-B-')
    const steps = [...main.querySelectorAll('#preset-steps-h ~ ol > li')]
    expect(steps.map(li => li.querySelector('h3')?.textContent)).toEqual(['1. remove diacritics', '2. replace', '3. change case'])
    expect(steps[1].textContent).toContain(XSS)
    expect(steps[2].querySelector('pre')?.textContent).toBe('CAFE-AU-LAIT\n-B-TWO-B-')
    expect(main.textContent).toContain('What if you skip a step?')
    expect(main.querySelector('a[href="/util/case/"]')).toBeTruthy()
    const open = main.querySelector('a.cta')!
    expect(open.getAttribute('href')).toMatch(/^\/#\/p\//)
    expect(open.getAttribute('rel')).toBe('nofollow')
    expect(main.querySelector('section[aria-label="guide"] h2')?.textContent).toBe('Why')
  })

  it("pre-renders an unbooked preset page's slot with the promo the app shows there, and none on utility pages", () => {
    const promo = html(read(dist, 'presets/shout-slugs/index.html')).querySelector('#root main header aside[data-promo]')!
    expect(promo.getAttribute('data-promo')).toBe('vscode')
    expect(promo.getAttribute('aria-label')).toBe('From String Utility Belt')
    expect(promo.className).toBe('sponsor hidden sm:grid')
    expect(html(read(dist, 'util/case/index.html')).querySelector('#root aside[data-promo]')).toBeNull()
  })

  it('pre-renders no extra promo on a preset page, and the index\'s one after its first category', () => {
    const page = html(read(dist, 'presets/shout-slugs/index.html'))
    expect(page.querySelector('#root main aside[data-promo-slot]')).toBeNull()
    const index = html(read(dist, 'presets/index.html')).querySelector('#root main aside[data-promo-slot="inline"]')!
    expect(index.getAttribute('data-promo')).toBe(promoPlan({ kind: 'index' }).inline)
    expect(index.previousElementSibling?.tagName).toBe('SECTION')
  })

  it('lists presets on their index, links them from the utilities they use and the sitemap', () => {
    const index = html(read(dist, 'presets/index.html'))
    expect(index.querySelector('#root main h1')?.textContent).toBe('Presets')
    expect(index.querySelector('#root main a[href="/presets/shout-slugs/"]')?.textContent).toContain(preset.name)
    expect(html(read(dist, 'util/case/index.html')).querySelector('#root main a[href="/presets/shout-slugs/"]')).toBeTruthy()
    expect(html(read(dist, 'util/trim/index.html')).querySelector('#root main a[href^="/presets/"]')).toBeNull()
    const doc = xml(read(dist, 'sitemap.xml'))
    const urls = [...doc.getElementsByTagName('url')].map(u => [u.getElementsByTagName('loc')[0].textContent, u.getElementsByTagName('lastmod')[0].textContent])
    expect(urls).toContainEqual([`${SITE}/presets/shout-slugs/`, '2026-06-02'])
    expect(urls).toContainEqual([`${SITE}/presets/`, '2026-06-02'])
    expect(result.pages).toBe(MANIFEST.length + 1 + 13)
  })

  it('fails the build when a preset no longer produces its first sample', async () => {
    const broken = { ...preset, samples: [{ ...preset.samples[0], output: 'SOMETHING ELSE' }, preset.samples[1]] }
    await expect(buildSeo({ outDir: fixtureDist(), root: ROOT, og: false, now: NOW, log: silent, presets: [{ preset: broken, guide: GUIDE }] }))
      .rejects.toThrow(/preset shout-slugs: its first sample no longer produces its expected output/)
  })

  it('refuses a preset slug that is not a safe path segment', async () => {
    await expect(buildSeo({ outDir: fixtureDist(), root: ROOT, og: false, now: NOW, log: silent, presets: [{ preset: { ...preset, slug: '../x' }, guide: GUIDE }] }))
      .rejects.toThrow(/preset slug "..\/x" is not safe/)
  })
})

describe('buildSeo with hostile utility metadata', () => {
  it('escapes every interpolation: no injected element, JSON-LD still parses, $-patterns kept literally', async () => {
    const dist = fixtureDist()
    const evil: UtilityMeta = {
      ...MANIFEST.find(m => m.id === 'trim')!,
      id: 'evil_util',
      name: XSS,
      description: XSS,
      category: XSS,
    }
    await buildSeo({ outDir: dist, root: ROOT, og: false, now: NOW, log: silent, manifest: [evil], examples: { evil_util: [{ title: XSS, input: XSS, output: XSS }] } })
    for (const rel of ['util/evil_util/index.html', 'utilities/index.html']) {
      const source = read(dist, rel)
      expect(source, rel).not.toContain('<script>alert(1)</script>')
      const doc = html(source)
      // only the template's module script and the JSON-LD blocks
      expect([...doc.querySelectorAll('script')].every(s => s.type === 'module' || s.type === 'application/ld+json'), rel).toBe(true)
    }
    const doc = html(read(dist, 'util/evil_util/index.html'))
    expect(doc.title).toBe(`${XSS} | String Utility Belt`)
    expect(doc.querySelector('meta[property="og:title"]')?.getAttribute('content')).toBe(`${XSS} | String Utility Belt`)
    expect(doc.querySelector('#root h1')?.textContent).toBe(XSS)
    // the example's input and output blocks (the first <pre> is the command-line snippet)
    expect([...doc.querySelectorAll('#root pre')].map(p => p.textContent)).toContain(XSS)
    const ld = [...doc.querySelectorAll('script[type="application/ld+json"]')].map(s => JSON.parse(s.textContent!))
    expect(ld[0].description).toBe(XSS)
    xml(read(dist, 'sitemap.xml'))
  }, 60000)

  it('refuses a utility id that is not a safe path segment', async () => {
    const dist = fixtureDist()
    const bad = { ...MANIFEST[0], id: '../../pwned' }
    await expect(buildSeo({ outDir: dist, root: ROOT, og: false, log: silent, manifest: [bad] })).rejects.toThrow(/not safe/)
  })
})

describe('buildSeo edge cases', () => {
  it('fails loudly when dist/index.html is missing (vite build not run)', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'build-seo-empty-'))
    tmpDirs.push(dir)
    await expect(buildSeo({ outDir: dir, root: ROOT, og: false, log: silent })).rejects.toThrow(/vite build/)
  })

  it('renders an OG image per utility and preset, plus the default card', async () => {
    const dist = fixtureDist()
    const manifest = MANIFEST.filter(m => m.id === 'trim' || m.id === 'tabs_spaces')
    const preset = STATIC_PRESETS[0]
    const guide = readFileSync(path.join(ROOT, 'src', 'presets', preset.slug, 'guide.md'), 'utf8')
    const result = await buildSeo({ outDir: dist, root: ROOT, now: NOW, log: silent, manifest, presets: [{ preset, guide }] })
    expect(readdirSync(path.join(dist, 'og')).sort()).toEqual(['default.png', 'presets', 'tabs_spaces.png', 'trim.png'])
    expect(readdirSync(path.join(dist, 'og', 'presets'))).toEqual([`${preset.slug}.png`])
    const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    for (const file of ['default.png', 'tabs_spaces.png', 'trim.png', `presets/${preset.slug}.png`]) {
      expect([...readFileSync(path.join(dist, 'og', file)).subarray(0, 8)], file).toEqual(png)
    }
    expect(result.ogImages).toBe(4)
    expect(result.missingGlyphs).toEqual([])
  }, 60000)
})

describe('resolveOg', () => {
  it('renders OG images by default, never with --no-og, and with --og-if-workers-ci only in Workers Builds', () => {
    expect(resolveOg([], {})).toBe(true)
    expect(resolveOg(['--', '--no-og'], { WORKERS_CI: '1' })).toBe(false)
    // npm run build's postbuild: fast locally and in GitHub CI, complete in the production deploy
    expect(resolveOg(['--', '--og-if-workers-ci'], {})).toBe(false)
    expect(resolveOg(['--', '--og-if-workers-ci'], { CI: 'true' })).toBe(false)
    expect(resolveOg(['--', '--og-if-workers-ci'], { WORKERS_CI: '1' })).toBe(true)
  })
})

describe('resolveOutDir', () => {
  const root = path.resolve('/repo')
  it('reads --outDir <dir>, --outDir=<dir>, then SEO_OUT_DIR, then dist', () => {
    expect(resolveOutDir(['--outDir', 'out'], {}, root)).toBe(path.join(root, 'out'))
    expect(resolveOutDir(['--', '--outDir=out2'], {}, root)).toBe(path.join(root, 'out2'))
    expect(resolveOutDir([], { SEO_OUT_DIR: 'envdir' }, root)).toBe(path.join(root, 'envdir'))
    expect(resolveOutDir([], {}, root)).toBe(path.join(root, 'dist'))
    const abs = path.resolve('/abs/out')
    expect(resolveOutDir(['--outDir', abs], {}, root)).toBe(abs)
  })
})

describe('buildRssItems', () => {
  const release = (version: string, bodyMd: string, date?: string) => ({ version, date, bodyMd })

  it('dates a non-empty Unreleased section with the build date, and leaves an empty one out', () => {
    const withChanges = buildRssItems([], [release('Unreleased', '### Added\n- a thing'), release('1.4.0', '- shipped', '2026-10-06')], '2026-10-07')
    expect(withChanges.map(i => [i.title, i.pubDate])).toEqual([['Unreleased changes', '2026-10-07'], ['Release 1.4.0', '2026-10-06']])

    const justCut = buildRssItems([], [release('Unreleased', '  \n'), release('1.4.0', '- shipped', '2026-10-06')], '2026-10-07')
    expect(justCut.map(i => i.title)).toEqual(['Release 1.4.0'])
  })
})

describe('buildSeo sitemap lastmod', () => {
  const preset = { ...STATIC_PRESETS[0], published: '2026-05-01', updated: '2026-06-02' }
  const guide = readFileSync(path.join(ROOT, 'src', 'presets', preset.slug, 'guide.md'), 'utf8')
  const [usedId] = metaOfPreset(preset).utilityIds
  const used = MANIFEST.find(m => m.id === usedId)!
  const trim = MANIFEST.find(m => m.id === 'trim')!
  const untracked: UtilityMeta = { ...trim, id: 'brand_new_util' }
  // when each source last changed; `brand_new_util` has no history (not committed yet)
  const SOURCES: Record<string, string> = {
    'src/utilities/trim': '2026-03-01',
    [`src/utilities/${usedId}`]: '2026-02-01',
    'src/components/Docs.tsx': '2026-04-04',
    'CHANGELOG.md': '2025-01-01',
    ...Object.fromEntries(SITE_PAGES.map((slug, i) => [`src/app/pages/content/${slug}.md`, `2026-01-1${i}`])),
  }
  const sourceDates: SourceDates = paths => paths.map(p => SOURCES[p]).filter(Boolean).sort().pop()
  let lastmods: Map<string, string | null | undefined>

  beforeAll(async () => {
    const dist = fixtureDist()
    await buildSeo({
      outDir: dist, root: ROOT, og: false, now: NOW, log: silent, sourceDates,
      manifest: [trim, used, untracked], presets: [{ preset, guide }],
    })
    lastmods = sitemapLastmods(dist)
  }, 60000)

  it("dates a utility page by its own folder's last change, or a newer preset it links to", () => {
    expect(trim.id).not.toBe(usedId)
    expect(lastmods.get(`${SITE}/util/trim/`)).toBe('2026-03-01')
    expect(lastmods.get(`${SITE}/util/${usedId}/`)).toBe('2026-06-02')
  })

  it('dates a page with no history (an uncommitted utility) by the build', () => {
    expect(lastmods.get(`${SITE}/util/brand_new_util/`)).toBe('2026-01-02')
  })

  it('dates an index by its newest entry, and the home page by the newest of what it lists', () => {
    expect(lastmods.get(`${SITE}/utilities/`)).toBe('2026-03-01')
    expect(lastmods.get(`${SITE}/presets/`)).toBe('2026-06-02')
    expect(lastmods.get(`${SITE}/`)).toBe('2026-06-02')
    const posts = [...lastmods].filter(([loc]) => /\/blog\/[^/]+\/$/.test(loc)).map(([, d]) => d!)
    expect(posts.length).toBeGreaterThan(0)
    expect(lastmods.get(`${SITE}/blog/`)).toBe(posts.sort().pop())
  })

  it('dates the usage guide and the site pages by the files they render, a preset by its own dates', () => {
    expect(lastmods.get(`${SITE}/docs/`)).toBe('2026-04-04')
    SITE_PAGES.forEach((slug, i) => expect(lastmods.get(`${SITE}/${slug}/`), slug).toBe(`2026-01-1${i}`))
    expect(lastmods.get(`${SITE}/presets/${preset.slug}/`)).toBe('2026-06-02')
  })
})
