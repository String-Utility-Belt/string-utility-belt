import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import type { UtilityMeta } from '../../src/core/registry'
import type { UtilityExample } from '../../src/types/utility'
import { MANIFEST } from '../../src/utilities/_generated/manifest'
import { EXAMPLES } from '../../src/utilities/_generated/examples'
// .js extension: the plain-JS markdown helpers shared with the app's blog
// components (`src/components/BlogPost.tsx`) — not duplicated here
import { parseFrontmatter } from '../../src/lib/markdown.js'
import { SITE_PAGES, type SitePageSlug } from '../../src/lib/router'
import { renderChangelogHtml } from '../../src/app/pages/changelogHtml'
import {
  setTitle, setMetaDescription, injectSeoHead, stripSeoHead, setRootContent, setRemovableRootContent,
  stripRootContent, setRobots, jsonLdScript, jsonDataScript, seoMetaTags, rssLinkTag,
} from './html'
import { buildSitemap, buildRss, toIsoDate, type SitemapUrl, type RssItem } from './xml'
import { readBlogManifest, readBlogPostSource, dropRepeatedTitle, isSafeSlug, postImage, type BlogPostMeta } from './blog'
import { discussLinks, parseTags, type DiscussLink } from '../../src/components/blogManifest'
import { parseChangelog, summarizeMarkdown, type ChangelogRelease } from './changelog'
import {
  renderUtilityContent, renderUtilitiesIndexContent, renderBlogIndexContent, renderBlogPostContent,
  renderChangelogContent, renderHomeContent, renderDocsContent, renderSitePageContent, renderNotFoundContent,
  renderSiteChrome, renderPresetContent, renderPresetsIndexContent, type PageSponsorSpec,
} from './content'
import { loadOgFonts, renderOgPng, runPool } from './og'
import { newest, readSourceDates, type SourceDates } from './lastmod'
import { parseGuide, renderGuideHtml, renderMarkdownDocument, type Guide } from '../../src/app/pages/guide'
import { relatedUtilities } from '../../src/app/pages/related'
import { featuredPresets, presetsUsing, relatedPresets, stepCountText } from '../../src/app/pages/presets/presetHelpers'
import { tracePreset, TRACE_ELEMENT_ID, type PipelineRunner, type PresetTrace } from '../../src/presets/trace'
import type { Preset, PresetMeta } from '../../src/presets/types'
import { metaOfPreset } from '../gen-presets'
import { sponsorFor, utcDay, type SponsorPage, type Sponsorship } from '../../src/app/sponsors/sponsors'
import { SPONSORSHIPS } from '../../src/app/sponsors/sponsorships'
import { parseSitePage } from '../../src/app/pages/sitePages'
import {
  SITE_NAME, SITE_URL, pageTitle, displayName, HOME_TITLE, homeDescription, utilitiesTitle, utilitiesDescription,
  BLOG_TITLE, BLOG_DESCRIPTION, CHANGELOG_TITLE, CHANGELOG_DESCRIPTION, DOCS_TITLE, DOCS_DESCRIPTION,
  PRESETS_TITLE, presetsDescription,
} from '../../src/app/pages/seo'

export const SITE = SITE_URL
const SITE_HOST = new URL(SITE).host
const DEFAULT_OG = `${SITE}/og/default.png`
const LOGO = `${SITE}/icons/icon-512.png`

export interface BuildSeoOptions {
  /** The `vite build` output directory; must already contain `index.html`. */
  outDir: string
  /** Repo root — where `CHANGELOG.md` lives. */
  root: string
  /** Render the Open Graph PNGs (default true; ~0.4s each). */
  og?: boolean
  ogConcurrency?: number
  /** Build time: the copyright year, the day's live sponsorships, and the lastmod of a page whose sources have no git history (default: now). */
  now?: Date
  log?: (message: string) => void
  /** Utilities to publish (default: the generated manifest + examples). */
  manifest?: UtilityMeta[]
  examples?: Record<string, UtilityExample[]>
  /** Guide markdown by utility id (default: each `src/utilities/<id>/guide.md` under `root`). */
  guides?: Record<string, string>
  /** Presets to publish, each with its guide markdown (default: every `src/presets/<slug>/` under `root`). */
  presets?: Array<{ preset: Preset; guide: string }>
  /** When each source file under `root` last changed (default: its git history, `readSourceDates`). */
  sourceDates?: SourceDates
  /** Booked sponsorships (default: `SPONSORSHIPS`); pages show those live on `now`'s UTC day. */
  sponsorships?: readonly Sponsorship[]
}

export interface BuildSeoResult {
  pages: number
  ogImages: number
  sitemapUrls: number
  rssItems: number
  htmlMs: number
  ogMs: number
  /** Characters some OG card needed but no OG font could draw. */
  missingGlyphs: string[]
}

/** `YYYY-MM-DD` / ISO strings only: anything else would render as an invented epoch date. */
const validDate = (value: string | undefined): string | undefined =>
  value && !Number.isNaN(new Date(value).getTime()) ? value : undefined

function writeOut(outDir: string, relPath: string, contents: string | Uint8Array): void {
  const file = path.join(outDir, relPath)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, contents)
}

// ---------------------------------------------------------------------------
// JSON-LD
// ---------------------------------------------------------------------------

const ORGANIZATION = { '@type': 'Organization', name: SITE_NAME, url: `${SITE}/`, logo: LOGO }
const WEBSITE = { '@type': 'WebSite', name: SITE_NAME, url: `${SITE}/` }
const FREE = { '@type': 'Offer', price: '0', priceCurrency: 'USD' }

/** On the home page only: tells Google the site's name (shown above every result) and publisher. */
function websiteLd(description: string) {
  return { '@context': 'https://schema.org', ...WEBSITE, description, inLanguage: 'en', publisher: ORGANIZATION }
}

function homeApplicationLd(description: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: SITE_NAME,
    url: `${SITE}/`,
    description,
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Any',
    browserRequirements: 'Requires JavaScript',
    isAccessibleForFree: true,
    offers: FREE,
  }
}

function webApplicationLd(meta: UtilityMeta, url: string, description: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: displayName(meta.name),
    applicationCategory: 'UtilitiesApplication',
    operatingSystem: 'Any',
    url,
    description,
    isAccessibleForFree: true,
    isPartOf: WEBSITE,
    offers: FREE,
  }
}

/** A preset page: a technical how-to whose subject is the utilities it chains. */
function techArticleLd(preset: Preset, url: string, description: string, image: string, utilities: UtilityMeta[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: preset.name,
    description,
    url,
    mainEntityOfPage: url,
    image,
    inLanguage: 'en',
    datePublished: preset.published,
    dateModified: preset.updated ?? preset.published,
    author: ORGANIZATION,
    publisher: ORGANIZATION,
    isPartOf: WEBSITE,
    about: utilities.map(u => ({ '@type': 'WebApplication', name: displayName(u.name), url: `${SITE}/util/${u.id}/` })),
  }
}

/** A page about the site itself (`AboutPage`, `ContactPage`, or a plain `WebPage` such as the privacy policy). */
function webPageLd(type: string, name: string, url: string, description: string) {
  return { '@context': 'https://schema.org', '@type': type, name, url, description, isPartOf: WEBSITE }
}

/** A post's preview image: its own (frontmatter `image`), else the card buildSeo renders for it. */
function postOgImage(post: PublishedPost): string {
  return post.image ? `${SITE}${post.image}` : `${SITE}/og/blog/${post.meta.slug}.png`
}

function blogPostingLd(post: PublishedPost, url: string) {
  const modified = post.updated ?? post.date
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.description,
    url,
    mainEntityOfPage: url,
    image: postOgImage(post),
    inLanguage: 'en',
    ...(post.date ? { datePublished: post.date } : {}),
    ...(modified ? { dateModified: modified } : {}),
    ...(post.discuss.length > 0 ? { discussionUrl: post.discuss.map(l => l.href) } : {}),
    author: ORGANIZATION,
    publisher: ORGANIZATION,
    isPartOf: WEBSITE,
  }
}

const HOME_CRUMB = { name: 'Home', url: `${SITE}/` }

function breadcrumbLd(items: Array<{ name: string; url: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: it.url })),
  }
}

const SITE_PAGE_TYPES: Record<SitePageSlug, string> = { about: 'AboutPage', privacy: 'WebPage', contact: 'ContactPage', integrations: 'WebPage', advertise: 'WebPage' }

// ---------------------------------------------------------------------------
// Page builders — each starts from the built `index.html` template (with any
// earlier run's SEO block and home content already stripped)
// ---------------------------------------------------------------------------

interface PageSpec {
  title: string
  description: string
  canonical: string
  ogImage: string
  ogType?: 'website' | 'article'
  published?: string
  modified?: string
  jsonLd?: unknown[]
  /** More trusted markup for the head block (a preset page's embedded trace). */
  head?: string[]
  content: string
}

function buildPage(template: string, page: PageSpec, year: number): string {
  let html = setTitle(template, page.title)
  html = setMetaDescription(html, page.description)
  const head = [
    seoMetaTags({
      title: page.title, description: page.description, canonical: page.canonical, ogImage: page.ogImage,
      ogType: page.ogType, published: page.published, modified: page.modified,
    }),
    ...(page.jsonLd ?? []).map(jsonLdScript),
    ...(page.head ?? []),
  ]
  html = injectSeoHead(html, head.join('\n'))
  return setRootContent(html, renderSiteChrome(page.content, year))
}

/** `src/utilities/<id>/guide.md`, when the utility has one. */
function readGuide(root: string, id: string): string | undefined {
  const file = path.join(root, 'src', 'utilities', id, 'guide.md')
  return existsSync(file) ? readFileSync(file, 'utf8') : undefined
}

function utilPage(meta: UtilityMeta, examples: UtilityExample[], guide: Guide | undefined, related: UtilityMeta[], presets: PresetMeta[], sponsor?: PageSponsorSpec): PageSpec {
  // the guide's search-facing title/description, as `UtilityDocPage` also sets them
  const name = displayName(meta.name)
  const title = pageTitle(guide?.title ?? name)
  const description = guide?.description || meta.description || `${name} — a ${SITE_NAME} utility.`
  const canonical = `${SITE}/util/${meta.id}/`
  return {
    title,
    description,
    canonical,
    ogImage: `${SITE}/og/${meta.id}.png`,
    jsonLd: [
      webApplicationLd(meta, canonical, description),
      breadcrumbLd([HOME_CRUMB, { name: 'Utilities', url: `${SITE}/utilities/` }, { name, url: canonical }]),
    ],
    content: renderUtilityContent(meta, examples, { guideHtml: guide && renderGuideHtml(guide), related, presets, sponsor }),
  }
}

export interface PublishedPost {
  meta: BlogPostMeta
  title: string
  description: string
  date?: string
  /** Frontmatter `updated`: the last substantial revision, when later than `date`. */
  updated?: string
  /** Frontmatter `image`: the post's own 1200x630 preview (`/blog/<name>.png`), used instead of a generated card. */
  image?: string
  /** Frontmatter `discuss`: threads about the post on other sites, linked at its end and as its `discussionUrl`. */
  discuss: DiscussLink[]
  bodyHtml: string
}

/** Posts whose markdown exists, with frontmatter merged over the manifest entry. */
function loadPosts(blogDir: string, log: (m: string) => void): PublishedPost[] {
  const posts: PublishedPost[] = []
  for (const meta of readBlogManifest(blogDir)) {
    const source = readBlogPostSource(blogDir, meta.slug)
    if (source === null) {
      // listing it would put a dead URL in the sitemap, feed and blog index
      log(`[build-seo] warning: blog manifest lists "${meta.slug}" but ${meta.slug}.md is missing — skipped`)
      continue
    }
    const { frontmatter, body } = parseFrontmatter(source) as { frontmatter: Record<string, string>; body: string }
    const title = frontmatter.title || meta.title
    const image = postImage(frontmatter.image, blogDir)
    if (frontmatter.image && !image) {
      log(`[build-seo] warning: ${meta.slug}.md's image "${frontmatter.image}" is not a PNG in blog/ — using its generated card`)
    }
    const discuss = discussLinks(frontmatter.discuss)
    if (discuss.length < parseTags(frontmatter.discuss).length) {
      log(`[build-seo] warning: ${meta.slug}.md's discuss lists a link that is not an https thread on a known site, or a second on one site — left out`)
    }
    posts.push({
      meta,
      title,
      description: frontmatter.description || meta.description || title,
      date: validDate(frontmatter.date) ?? validDate(meta.date),
      updated: validDate(frontmatter.updated),
      image,
      discuss,
      // the renderer `BlogPost` uses too: guide syntax (lists, tables) at the post's own heading levels
      bodyHtml: renderMarkdownDocument(dropRepeatedTitle(body, title)),
    })
  }
  return posts
}

/**
 * Blog posts plus one item per changelog release with something in it (the
 * `Unreleased` heading sits empty right after a release is cut); dated items
 * newest first, undated after.
 */
export function buildRssItems(posts: PublishedPost[], releases: ChangelogRelease[], buildDate: string): RssItem[] {
  const items: RssItem[] = [
    ...posts.map(p => ({
      title: p.title,
      link: `${SITE}/blog/${p.meta.slug}/`,
      description: p.description,
      pubDate: p.date,
    })),
    ...releases.filter(r => r.bodyMd.trim() !== '').map(r => {
      const unreleased = r.version.toLowerCase() === 'unreleased'
      return {
        title: unreleased ? 'Unreleased changes' : `Release ${r.version}`,
        link: `${SITE}/changelog/`,
        description: summarizeMarkdown(r.bodyMd) || `${SITE_NAME} ${r.version}`,
        // the unreleased section is what is live right now; a versioned
        // release without a date gets no date rather than an invented one
        pubDate: validDate(r.date) ?? (unreleased ? buildDate : undefined),
        // not a URL: a `#fragment` on the changelog link would be read as an
        // app route by the hash router
        guid: `tag:${SITE_HOST},2025:changelog/${encodeURIComponent(r.version)}`,
      }
    }),
  ]
  const time = (item: RssItem) => (item.pubDate === undefined ? -Infinity : new Date(item.pubDate).getTime())
  return items.sort((a, b) => time(b) - time(a))
}

/** Every preset under `root` (`src/presets/<slug>/`), with its guide markdown. */
async function loadPresets(root: string): Promise<Array<{ preset: Preset; guide: string }>> {
  const { STATIC_PRESETS } = await import('../../src/presets/_generated/static')
  return STATIC_PRESETS.map(preset => {
    const file = path.join(root, 'src', 'presets', preset.slug, 'guide.md')
    if (!existsSync(file)) throw new Error(`[build-seo] preset ${preset.slug} has no guide.md`)
    return { preset, guide: readFileSync(file, 'utf8') }
  })
}

/**
 * Each preset's worked example, run in Node with the static registry: the step
 * outputs the page shows and embeds. A first sample that no longer produces its
 * expected output fails the build: the page would show a different result than
 * the preset promises (and than `presets.test.ts` checks).
 */
async function tracePresets(presets: Preset[]): Promise<Map<string, PresetTrace>> {
  const traces = new Map<string, PresetTrace>()
  if (presets.length === 0) return traces
  const [{ staticRegistry }, { runPipeline }] = await Promise.all([
    import('../../src/utilities/static-registry'),
    import('../../src/core/runner'),
  ])
  const run: PipelineRunner = (input, steps, previews) => runPipeline(input, steps, { load: staticRegistry.load, previews, env: 'node' })
  for (const preset of presets) {
    const trace = await tracePreset(preset, run)
    const failed = trace.steps.find(s => s.error)
    const hint = `run \`npm run check:presets -- ${preset.slug}\``
    if (failed) throw new Error(`[build-seo] preset ${preset.slug}: step ${failed.id} fails on its first sample (${failed.error}) — ${hint}`)
    if (trace.output !== preset.samples[0].output) {
      throw new Error(`[build-seo] preset ${preset.slug}: its first sample no longer produces its expected output — ${hint}`)
    }
    traces.set(preset.slug, trace)
  }
  return traces
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

/**
 * The post-`vite build` SEO pass over `outDir`: pre-rendered pages for every
 * utility, the utilities index, the blog, the changelog, the usage guide (`/docs/`)
 * and the site pages (about, privacy, contact); `404.html`; `sitemap.xml`, `rss.xml`; the home
 * page's head and static content; and OG images. Every page's static content
 * sits in the site's header nav and footer. Idempotent — re-running over its
 * own output rewrites the same files.
 */
export async function buildSeo(options: BuildSeoOptions): Promise<BuildSeoResult> {
  const { outDir, root, og = true, ogConcurrency = 4, log = console.log } = options
  const manifest = options.manifest ?? MANIFEST
  const examples = options.examples ?? EXAMPLES
  const now = options.now ?? new Date()
  const year = now.getUTCFullYear()
  const t0 = Date.now()
  const sponsorships = options.sponsorships ?? SPONSORSHIPS
  const sponsorDay = utcDay(now)
  const sponsorOf = (page: SponsorPage): PageSponsorSpec | undefined => {
    const sponsorship = sponsorFor(page, sponsorDay, sponsorships)
    return sponsorship && { sponsorship, page }
  }

  const indexHtmlPath = path.join(outDir, 'index.html')
  if (!existsSync(indexHtmlPath)) {
    throw new Error(`[build-seo] ${indexHtmlPath} not found — run \`vite build\` first (or pass --outDir).`)
  }
  for (const meta of manifest) {
    if (!isSafeSlug(meta.id)) throw new Error(`[build-seo] utility id ${JSON.stringify(meta.id)} is not safe as a path segment`)
  }
  const presets = options.presets ?? await loadPresets(root)
  for (const { preset } of presets) {
    if (!isSafeSlug(preset.slug)) throw new Error(`[build-seo] preset slug ${JSON.stringify(preset.slug)} is not safe as a path segment`)
  }
  const presetMetas = presets.map(r => metaOfPreset(r.preset))
  const traces = await tracePresets(presets.map(r => r.preset))
  // a processed index.html (an earlier run's output) back to the bare `vite build` template
  const template = stripRootContent(stripSeoHead(readFileSync(indexHtmlPath, 'utf8')))
  const blogDir = path.join(outDir, 'blog')
  const posts = loadPosts(blogDir, log)
  const changelogMd = readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8')
  const releases = parseChangelog(changelogMd)
  let pages = 0
  const emit = (relPath: string, html: string) => {
    writeOut(outDir, relPath, html)
    pages++
  }
  const page = (relPath: string, spec: PageSpec) => emit(relPath, buildPage(template, spec, year))

  let guides = 0
  for (const meta of manifest) {
    const source = options.guides ? options.guides[meta.id] : readGuide(root, meta.id)
    const guide = source === undefined ? undefined : parseGuide(source)
    if (guide) guides++
    page(path.join('util', meta.id, 'index.html'),
      utilPage(meta, examples[meta.id] ?? [], guide, relatedUtilities(meta, manifest), presetsUsing(meta.id, presetMetas),
        sponsorOf({ kind: 'utility', id: meta.id })))
  }
  if (guides < manifest.length) log(`[build-seo] warning: ${manifest.length - guides} of ${manifest.length} utilities have no guide.md`)

  const utilitiesUrl = `${SITE}/utilities/`
  page(path.join('utilities', 'index.html'), {
    title: utilitiesTitle(manifest.length),
    description: utilitiesDescription(manifest.length),
    canonical: utilitiesUrl,
    ogImage: DEFAULT_OG,
    jsonLd: [
      webPageLd('CollectionPage', 'All utilities', utilitiesUrl, utilitiesDescription(manifest.length)),
      breadcrumbLd([HOME_CRUMB, { name: 'Utilities', url: utilitiesUrl }]),
    ],
    content: renderUtilitiesIndexContent(manifest),
  })

  const presetsUrl = `${SITE}/presets/`
  const presetsDesc = presetsDescription(presets.length)
  page(path.join('presets', 'index.html'), {
    title: PRESETS_TITLE,
    description: presetsDesc,
    canonical: presetsUrl,
    ogImage: DEFAULT_OG,
    jsonLd: [
      webPageLd('CollectionPage', 'Presets', presetsUrl, presetsDesc),
      breadcrumbLd([HOME_CRUMB, { name: 'Presets', url: presetsUrl }]),
    ],
    content: renderPresetsIndexContent(presetMetas),
  })
  const utilityById = new Map(manifest.map(m => [m.id, m]))
  for (const [i, { preset, guide }] of presets.entries()) {
    const parsed = parseGuide(guide)
    const url = `${SITE}/presets/${preset.slug}/`
    const ogImage = `${SITE}/og/presets/${preset.slug}.png`
    const description = parsed.description ?? preset.summary
    const trace = traces.get(preset.slug)!
    const utilities = presetMetas[i].utilityIds.flatMap(id => utilityById.get(id) ?? [])
    page(path.join('presets', preset.slug, 'index.html'), {
      title: pageTitle(parsed.title ?? preset.name),
      description,
      canonical: url,
      ogImage,
      ogType: 'article',
      published: preset.published,
      modified: preset.updated,
      jsonLd: [
        techArticleLd(preset, url, description, ogImage, utilities),
        breadcrumbLd([HOME_CRUMB, { name: 'Presets', url: presetsUrl }, { name: preset.name, url }]),
      ],
      // the app fills the page from this instead of re-running the pipeline on load
      head: [jsonDataScript(TRACE_ELEMENT_ID, trace)],
      content: renderPresetContent({
        preset,
        guideHtml: renderMarkdownDocument(guide),
        trace,
        utility: id => utilityById.get(id),
        related: relatedPresets(preset, presetMetas),
        sponsor: sponsorOf({ kind: 'preset', slug: preset.slug }),
      }),
    })
  }

  const blogUrl = `${SITE}/blog/`
  page(path.join('blog', 'index.html'), {
    title: BLOG_TITLE,
    description: BLOG_DESCRIPTION,
    canonical: blogUrl,
    ogImage: DEFAULT_OG,
    jsonLd: [breadcrumbLd([HOME_CRUMB, { name: 'Blog', url: blogUrl }])],
    content: renderBlogIndexContent(posts.map(p => ({ ...p.meta, title: p.title, description: p.description, date: p.date }))),
  })
  for (const post of posts) {
    const url = `${SITE}/blog/${post.meta.slug}/`
    page(path.join('blog', post.meta.slug, 'index.html'), {
      title: pageTitle(post.title),
      description: post.description,
      canonical: url,
      ogImage: postOgImage(post),
      ogType: 'article',
      published: post.date,
      modified: post.updated,
      jsonLd: [
        blogPostingLd(post, url),
        breadcrumbLd([HOME_CRUMB, { name: 'Blog', url: blogUrl }, { name: post.title, url }]),
      ],
      content: renderBlogPostContent({ title: post.title, date: post.date, updated: post.updated, discuss: post.discuss }, post.bodyHtml,
        sponsorOf({ kind: 'blog', slug: post.meta.slug })),
    })
  }

  page(path.join('changelog', 'index.html'), {
    title: CHANGELOG_TITLE,
    description: CHANGELOG_DESCRIPTION,
    canonical: `${SITE}/changelog/`,
    ogImage: DEFAULT_OG,
    content: renderChangelogContent(renderChangelogHtml(changelogMd)),
  })

  const docsUrl = `${SITE}/docs/`
  page(path.join('docs', 'index.html'), {
    title: DOCS_TITLE,
    description: DOCS_DESCRIPTION,
    canonical: docsUrl,
    ogImage: DEFAULT_OG,
    jsonLd: [breadcrumbLd([HOME_CRUMB, { name: 'Docs', url: docsUrl }])],
    content: renderDocsContent(),
  })

  for (const slug of SITE_PAGES) {
    const doc = parseSitePage(readFileSync(path.join(root, 'src', 'app', 'pages', 'content', `${slug}.md`), 'utf8'))
    const url = `${SITE}/${slug}/`
    const heading = doc.title.split(' — ')[0]
    page(path.join(slug, 'index.html'), {
      title: pageTitle(doc.title),
      description: doc.description,
      canonical: url,
      ogImage: DEFAULT_OG,
      jsonLd: [
        webPageLd(SITE_PAGE_TYPES[slug], heading, url, doc.description),
        breadcrumbLd([HOME_CRUMB, { name: heading, url }]),
      ],
      content: renderSitePageContent(doc.html),
    })
  }

  // served with a 404 status for any path that is not a page (wrangler.jsonc
  // not_found_handling: "404-page"); no canonical, and kept out of the index
  let notFound = setTitle(template, pageTitle('Page not found'))
  notFound = setMetaDescription(notFound, `There is no ${SITE_NAME} page at this address.`)
  notFound = setRobots(notFound, 'noindex')
  emit('404.html', setRootContent(notFound, renderSiteChrome(renderNotFoundContent(), year)))

  // home: title, description, RSS discovery, canonical, default OG, the site's
  // name/publisher for search results, and the popular-tools links as static content
  const homeDesc = homeDescription(manifest.length)
  let home = setMetaDescription(setTitle(template, HOME_TITLE), homeDesc)
  home = injectSeoHead(home, [
    rssLinkTag(`${SITE}/rss.xml`),
    seoMetaTags({ title: HOME_TITLE, description: homeDesc, canonical: `${SITE}/`, ogImage: DEFAULT_OG }),
    jsonLdScript(websiteLd(homeDesc)),
    jsonLdScript(homeApplicationLd(homeDesc)),
  ].join('\n'))
  // removable: this file is the next run's template
  writeOut(outDir, 'index.html', setRemovableRootContent(home, renderSiteChrome(renderHomeContent(manifest, featuredPresets(presetMetas)), year)))

  // lastmod: when the page's content last changed — its source files' last commit, or a preset's
  // or post's own dates; an index takes its newest entry. Never the build time: the site deploys
  // several times a day, and search engines ignore a lastmod that moves without the page changing.
  // Shared templates (scripts/seo/content.ts, the site chrome) and head strings (seo.ts) don't count.
  const buildDate = toIsoDate(now)
  const sourceDates = options.sourceDates ?? readSourceDates(root, { fallback: buildDate, log })
  // a path with no history is uncommitted: changed now
  const changed = (...paths: string[]) => sourceDates(paths) ?? buildDate
  const presetLastmod = (r: { published: string; updated?: string }) => r.updated ?? r.published
  const utilityContent = new Map(manifest.map(m => [m.id, changed(`src/utilities/${m.id}`)]))
  // its own module and guide, and the presets it links to
  const utilityLastmod = (id: string) => newest([utilityContent.get(id), ...presetsUsing(id, presetMetas).map(presetLastmod)])!
  const utilitiesLastmod = newest([...utilityContent.values()]) ?? changed('src/utilities')
  const presetsLastmod = newest(presets.map(r => presetLastmod(r.preset))) ?? changed('src/presets')
  const postLastmods = posts.map(p => {
    const dated = p.updated ?? p.date
    return dated ? toIsoDate(dated) : changed(`public/blog/${p.meta.slug}.md`)
  })
  const changelogLastmod = releases.map(r => validDate(r.date)).find(Boolean) ?? changed('CHANGELOG.md')
  const sitemapUrls: SitemapUrl[] = [
    // the home page lists popular utilities and featured presets
    { loc: `${SITE}/`, lastmod: newest([utilitiesLastmod, presetsLastmod])! },
    { loc: docsUrl, lastmod: changed('src/components/Docs.tsx') },
    { loc: utilitiesUrl, lastmod: utilitiesLastmod },
    ...manifest.map(m => ({ loc: `${SITE}/util/${m.id}/`, lastmod: utilityLastmod(m.id) })),
    // the index changes when a preset is added or revised; a preset when it is revised
    { loc: presetsUrl, lastmod: presetsLastmod },
    ...presets.map(({ preset }) => ({ loc: `${SITE}/presets/${preset.slug}/`, lastmod: presetLastmod(preset) })),
    { loc: blogUrl, lastmod: newest(postLastmods) ?? changed('public/blog') },
    ...posts.map((p, i) => ({ loc: `${SITE}/blog/${p.meta.slug}/`, lastmod: postLastmods[i] })),
    { loc: `${SITE}/changelog/`, lastmod: changelogLastmod },
    ...SITE_PAGES.map(slug => ({ loc: `${SITE}/${slug}/`, lastmod: changed(`src/app/pages/content/${slug}.md`) })),
  ]
  writeOut(outDir, 'sitemap.xml', buildSitemap(sitemapUrls))

  const rssItems = buildRssItems(posts, releases, buildDate)
  writeOut(outDir, 'rss.xml', buildRss({
    title: SITE_NAME,
    link: `${SITE}/`,
    description: `New blog posts and releases from ${SITE_NAME}.`,
    items: rssItems,
  }))
  const htmlMs = Date.now() - t0

  const ogStart = Date.now()
  const missing = new Set<string>()
  let ogImages = 0
  if (og) {
    const fonts = loadOgFonts()
    const onMissingGlyphs = (segment: string) => { for (const ch of segment) if (ch.trim()) missing.add(ch) }
    const cards = [
      ...manifest.map(m => ({ file: `${m.id}.png`, card: { name: displayName(m.name), category: m.category, description: m.description } })),
      ...presetMetas.map(r => ({
        file: path.join('presets', `${r.slug}.png`),
        card: { name: r.name, category: `Preset · ${stepCountText(r.stepCount)}`, description: r.chain.join(' → ') },
      })),
      ...posts.filter(p => !p.image).map(p => ({
        file: path.join('blog', `${p.meta.slug}.png`),
        card: { name: p.title, category: 'Blog', description: p.description },
      })),
      {
        file: 'default.png',
        card: { name: SITE_NAME, category: 'Free online tool', description: 'Chain string transformations into visual pipelines with live previews.' },
      },
    ]
    // satori and resvg-wasm are synchronous CPU work on this one thread, so
    // the pool only overlaps file writes — a small limit is enough
    await runPool(cards, ogConcurrency, async ({ file, card }) => {
      writeOut(outDir, path.join('og', file), await renderOgPng(card, fonts, { onMissingGlyphs }))
      ogImages++
    })
    if (missing.size) log(`[build-seo] warning: OG font has no glyph for ${[...missing].join(' ')} — add a mapping in scripts/seo/og.ts ogText()`)
  }
  const ogMs = Date.now() - ogStart

  return { pages, ogImages, sitemapUrls: sitemapUrls.length, rssItems: rssItems.length, htmlMs, ogMs, missingGlyphs: [...missing] }
}
