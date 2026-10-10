import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { UtilityMeta } from '../../src/core/registry'
import { defaultParams } from '../../src/core/params'
import type { ParamSpec, UtilityExample } from '../../src/types/utility'
import { escapeHtml } from './html'
import type { BlogPostMeta } from './blog'
import { guideHeading } from '../../src/app/pages/guide'
import { utilityPath } from '../../src/app/pages/related'
import { POPULAR_UTILITY_IDS, SITE_NAME, displayName } from '../../src/app/pages/seo'
import Docs from '../../src/components/Docs'
import { en } from '../../src/app/i18n/locales/en'
import { INTEGRATION_LINKS } from '../../src/app/integrations/links'
import RunElsewhere from '../../src/app/integrations/RunElsewhere'
import { PresetArticle, PresetsIndex, PresetWidget } from '../../src/app/pages/presets/PresetArticle'
import { openInEditorHref } from '../../src/app/pages/presets/presetHelpers'
import { presetPath, toPipelineSteps, type Preset, type PresetMeta } from '../../src/presets/types'
import type { PresetTrace } from '../../src/presets/trace'
import SponsorBlock from '../../src/app/sponsors/SponsorBlock'
import PromoBlock from '../../src/app/sponsors/PromoBlock'
import ExtraPromo from '../../src/app/sponsors/ExtraPromo'
import { fixedPromo, promoPlan, type PromoPage } from '../../src/app/sponsors/promos'
import type { SponsorPage, Sponsorship } from '../../src/app/sponsors/sponsors'
import { GITHUB_SPONSORS_URL } from '../../src/app/support'

/** A page's sponsor at build time, rendered by the app's own `SponsorBlock`. */
export interface PageSponsorSpec {
  sponsorship: Sponsorship
  page: SponsorPage
}

const sponsorElement = (spec: PageSponsorSpec, className?: string) => createElement(SponsorBlock, { ...spec, className })
const renderSponsor = (spec: PageSponsorSpec | undefined, className?: string): string =>
  spec ? renderToStaticMarkup(sponsorElement(spec, className)) : ''

const typesOf = (t: string | string[]): string => (Array.isArray(t) ? t.join(' | ') : t)

const link = ([href, label]: readonly [string, string]) => `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`

// the app's header nav and footer (src/app/AppShell.tsx), as plain links
const NAV_LINKS = [['/', 'Tool'], ['/docs/', 'Docs'], ['/utilities/', 'Utilities'], ['/presets/', 'Presets'], ['/blog/', 'Blog'], ['/changelog/', 'Changelog']] as const
const FOOTER_LINKS = [
  ['/utilities/', 'All utilities'], ['/presets/', 'Presets'], ['/blog/', 'Blog'], ['/changelog/', 'Changelog'], ['/integrations/', 'Extensions, CLI & MCP'],
  ['/about/', 'About'], ['/privacy/', 'Privacy policy'], ['/contact/', 'Contact'], ['/advertise/', 'Advertise'],
] as const

// the header's integrations group (src/app/integrations/IntegrationsNav.tsx)
const integrationsNav = (): string => {
  const links = INTEGRATION_LINKS.map(l => {
    const label = escapeHtml(en.integrations[l.id])
    return l.external
      ? `<a href="${escapeHtml(l.href)}" target="_blank" rel="noopener">${label}</a>`
      : `<a href="${escapeHtml(l.href)}">${label}</a>`
  })
  return `<nav aria-label="${escapeHtml(en.integrations.label)}">${escapeHtml(en.integrations.lead)} ${links.join(' ')}</nav>`
}

/**
 * A pre-rendered page's content inside the site's header nav and footer, so the
 * static HTML links every page to the main sections and the about, privacy and
 * contact pages even before (or without) React replacing it.
 */
export function renderSiteChrome(contentHtml: string, year: number): string {
  return `
  <header>
    <a href="/">${escapeHtml(SITE_NAME)}</a>
    <nav aria-label="main">${NAV_LINKS.map(link).join(' ')}</nav>
    ${integrationsNav()}
  </header>
  <main>${contentHtml}</main>
  <footer>
    <nav aria-label="site">${FOOTER_LINKS.map(link).join(' ')} <a href="${escapeHtml(GITHUB_SPONSORS_URL)}" target="_blank" rel="noopener">${escapeHtml(en.footer.sponsor)}</a></nav>
    <p>© ${year} ${escapeHtml(SITE_NAME)}</p>
  </footer>`
}

function boundsOrOptions(spec: ParamSpec): string {
  switch (spec.kind) {
    case 'number':
    case 'range': {
      const parts: string[] = []
      if (spec.min !== undefined || spec.max !== undefined) parts.push(`${spec.min ?? '−∞'}–${spec.max ?? '∞'}`)
      if (spec.kind === 'number' && spec.step !== undefined) parts.push(`step ${spec.step}`)
      if (spec.kind === 'number' && spec.integer) parts.push('integer')
      return parts.join(', ') || '—'
    }
    case 'select':
    case 'multiselect':
      return spec.options.join(', ')
    case 'string':
      return spec.maxLength ? `max ${spec.maxLength} chars` : '—'
    default:
      return '—'
  }
}

const defaultOf = (spec: ParamSpec): string => {
  if (!('default' in spec) || spec.default === undefined) return '—'
  const d = (spec as { default?: unknown }).default
  return typeof d === 'string' ? d || '(empty)' : JSON.stringify(d)
}

export interface UtilityContentExtras {
  /** The rendered guide body (`renderGuideHtml`), shown in a collapsed `<details>`. */
  guideHtml?: string
  /** Utilities to link to, by their crawlable `/util/<id>/` paths. */
  related?: UtilityMeta[]
  /** Presets that use this utility, linked by their `/presets/<slug>/` paths. */
  presets?: PresetMeta[]
  /** The page's sponsor, at the end of the header as in `UtilityDocPage`. */
  sponsor?: PageSponsorSpec
}

/**
 * Static, crawlable snapshot of a utility doc page: name, description, guide,
 * params, examples and related utilities as plain semantic HTML. React
 * replaces this element on mount (`UtilityDocPage`); search engines and link
 * previews see this markup.
 */
export function renderUtilityContent(meta: UtilityMeta, examples: UtilityExample[], extras: UtilityContentExtras = {}): string {
  // collapsed like the app's, but the text is in the document for crawlers (and no-JS readers)
  const guideHtml = !extras.guideHtml ? '' : `
    <details>
      <summary><h2>${escapeHtml(guideHeading(meta.name))}</h2> Detailed guide with worked examples</summary>
      <div>${extras.guideHtml}</div>
    </details>`

  const params = Object.entries(meta.params)
  const paramsHtml = params.length === 0 ? '' : `
    <section>
      <h2>Parameters</h2>
      <table>
        <thead><tr><th>name</th><th>kind</th><th>default</th><th>bounds / options</th><th>description</th></tr></thead>
        <tbody>
          ${params.map(([name, spec]) => `
          <tr>
            <td>${escapeHtml(name)}</td>
            <td>${escapeHtml(spec.kind)}</td>
            <td>${escapeHtml(defaultOf(spec))}</td>
            <td>${escapeHtml(boundsOrOptions(spec))}</td>
            <td>${escapeHtml(spec.description ?? '—')}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </section>`

  const examplesHtml = examples.length === 0 ? '' : `
    <section>
      <h2>Examples</h2>
      ${examples.map(ex => `
      <div>
        ${ex.title ? `<h3>${escapeHtml(ex.title)}</h3>` : ''}
        <p>input${ex.inputEncoding && ex.inputEncoding !== 'text' ? ` (${escapeHtml(ex.inputEncoding)})` : ''}</p>
        <pre>${escapeHtml(ex.input)}</pre>
        ${ex.params && Object.keys(ex.params).length > 0 ? `<p>params</p><pre>${escapeHtml(JSON.stringify(ex.params))}</pre>` : ''}
        <p>output</p>
        <pre>${escapeHtml(ex.output ?? '(non-deterministic)')}</pre>
      </div>`).join('')}
    </section>`

  const presets = extras.presets ?? []
  const presetsHtml = presets.length === 0 ? '' : `
    <section>
      <h2>Presets that use ${escapeHtml(displayName(meta.name))}</h2>
      <ul>
        ${presets.map(r => `<li><a href="${escapeHtml(presetPath(r.slug))}">${escapeHtml(r.name)}</a> — ${escapeHtml(r.summary)}</li>`).join('')}
      </ul>
    </section>`

  const related = extras.related ?? []
  const relatedHtml = related.length === 0 ? '' : `
    <section>
      <h2>Related utilities</h2>
      <ul>
        ${related.map(u => `<li><a href="${escapeHtml(utilityPath(u.id))}">${escapeHtml(displayName(u.name))}</a> — ${escapeHtml(u.description)}</li>`).join('')}
      </ul>
    </section>`

  return `
  <article>
    <header>
      <h1>${escapeHtml(displayName(meta.name))}</h1>
      <p>${escapeHtml(meta.category)}</p>
      <p>${escapeHtml(meta.description)}</p>
      <p>accepts <code>${escapeHtml(typesOf(meta.accepts))}</code> → produces <code>${escapeHtml(typesOf(meta.produces))}</code></p>
      ${renderSponsor(extras.sponsor)}
    </header>
    ${renderToStaticMarkup(createElement(RunElsewhere, { meta, input: '', params: defaultParams(meta) }))}
    ${guideHtml}
    ${paramsHtml}
    ${examplesHtml}
    ${presetsHtml}
    ${relatedHtml}
    <p><a href="/utilities/">Browse all utilities</a></p>
  </article>`
}

/** Static snapshot of `UtilitiesIndexPage`: every utility grouped by category. */
export function renderUtilitiesIndexContent(manifest: UtilityMeta[]): string {
  const categories = [...new Set(manifest.map(m => m.category))]
  const groups = categories.map(cat => {
    const items = manifest.filter(m => m.category === cat)
    return `
    <section>
      <h2>${escapeHtml(cat)} (${items.length})</h2>
      <ul>
        ${items.map(u => `<li><a href="/util/${escapeHtml(u.id)}/">${escapeHtml(displayName(u.name))}</a> — ${escapeHtml(u.description)}</li>`).join('')}
      </ul>
    </section>`
  }).join('')
  return `
  <div>
    <h1>All utilities</h1>
    <p>${manifest.length} free text and string tools, grouped by category. Each one runs in your browser and has its own page with a guide, worked examples and a live playground.</p>
    ${groups}
  </div>`
}

/**
 * Static snapshot of the home page: the tool's heading and the popular-tools
 * list `HomeDirectory` renders below the editor (the editor itself needs JS).
 */
export function renderHomeContent(manifest: UtilityMeta[], presets: PresetMeta[] = []): string {
  const byId = new Map(manifest.map(m => [m.id, m]))
  const popular = POPULAR_UTILITY_IDS.flatMap(id => byId.get(id) ?? [])
  const presetsHtml = presets.length === 0 ? '' : `
    <section>
      <h2>Presets</h2>
      <p>Ready-made pipelines for jobs one tool can't do alone. Each shows every step with its output.</p>
      <ul>
        ${presets.map(r => `<li><a href="${escapeHtml(presetPath(r.slug))}">${escapeHtml(r.name)}</a> — ${escapeHtml(r.summary)}</li>`).join('')}
      </ul>
      <p><a href="/presets/">Browse all presets</a></p>
    </section>`
  return `
  <article>
    <header>
      <h1>${escapeHtml(SITE_NAME)}</h1>
      <p>Efficiently chain string utilities, preview every step, and export/share your pipeline.</p>
    </header>
    ${presetsHtml}
    <section>
      <h2>Popular tools</h2>
      <p>Every utility also has its own page with a guide, worked examples and a playground. They all run in your browser: nothing you paste is uploaded.</p>
      <ul>
        ${popular.map(u => `<li><a href="${escapeHtml(utilityPath(u.id))}">${escapeHtml(displayName(u.name))}</a> — ${escapeHtml(u.description)}</li>`).join('')}
      </ul>
      <p><a href="/utilities/">Browse all ${manifest.length} utilities</a></p>
    </section>
  </article>`
}

/**
 * Static snapshot of the usage guide: the `Docs` component itself, rendered by React
 * (so escaped), which keeps the pre-render from drifting from the page.
 */
export function renderDocsContent(): string {
  return renderToStaticMarkup(createElement(Docs))
}

/** Static snapshot of `SitePage`: the page's rendered markdown (already escaped), `# heading` included. */
export function renderSitePageContent(bodyHtml: string): string {
  return `<article>${bodyHtml}</article>`
}

/** The body of `404.html`, served (with a 404 status) for any path that is not a page. */
export function renderNotFoundContent(): string {
  return `
  <article>
    <h1>Page not found</h1>
    <p>There is no page at this address. It may have moved, or the link may be mistyped.</p>
    <ul>
      <li><a href="/">Open the pipeline tool</a></li>
      <li><a href="/utilities/">Browse all utilities</a></li>
      <li><a href="/blog/">Read the blog</a></li>
    </ul>
  </article>`
}

/** Static snapshot of `BlogIndex`. */
export function renderBlogIndexContent(posts: BlogPostMeta[]): string {
  if (posts.length === 0) return '<div><h1>Blog</h1><p>No posts yet.</p></div>'
  const items = posts.map(p => `
    <li>
      <a href="/blog/${escapeHtml(p.slug)}/">${escapeHtml(p.title)}</a>
      ${p.date ? `<time datetime="${escapeHtml(p.date)}">${escapeHtml(p.date)}</time>` : ''}
      ${p.description ? `<p>${escapeHtml(p.description)}</p>` : ''}
    </li>`).join('')
  return `<div><h1>Blog</h1><ul>${items}</ul></div>`
}

/** Static snapshot of `BlogPost`: pre-rendered markdown body (already HTML-escaped by `renderMarkdownDocument`). */
export function renderBlogPostContent(meta: { title?: string; date?: string; updated?: string }, bodyHtml: string, sponsor?: PageSponsorSpec): string {
  const updated = meta.updated && meta.updated !== meta.date
    ? `<p>Updated <time datetime="${escapeHtml(meta.updated)}">${escapeHtml(meta.updated)}</time></p>`
    : ''
  return `
  <article>
    <header>
      ${meta.title ? `<h1>${escapeHtml(meta.title)}</h1>` : ''}
      ${meta.date ? `<time datetime="${escapeHtml(meta.date)}">${escapeHtml(meta.date)}</time>` : ''}
      ${updated}
      ${renderSponsor(sponsor, 'mt-3')}
    </header>
    <div>${bodyHtml}</div>
  </article>`
}

/**
 * Static snapshot of `ChangelogPage`: pre-rendered markdown (already escaped by
 * `renderChangelogHtml`), whose own `# Changelog` is the page heading.
 */
export function renderChangelogContent(bodyHtml: string): string {
  return `<article>${bodyHtml}</article>`
}

/**
 * Static snapshot of a preset page: `PresetArticle` itself, rendered by React (so
 * escaped, and identical to the page the app renders), with its live widget as a
 * read-only copy showing the first sample and the build's trace of it.
 */
export function renderPresetContent(opts: {
  preset: Preset
  guideHtml: string
  trace: PresetTrace
  utility: (id: string) => UtilityMeta | undefined
  related: PresetMeta[]
  sponsor?: PageSponsorSpec
}): string {
  const { preset, guideHtml, trace, utility, related, sponsor } = opts
  const steps = toPipelineSteps(preset.steps)
  const first = preset.samples[0]
  const live = createElement(PresetWidget, {
    samples: preset.samples,
    sampleId: first.id,
    input: first.input,
    output: trace.output,
    stepCount: preset.steps.length,
    openHref: openInEditorHref(steps, preset.name, first.input),
  })
  return renderToStaticMarkup(createElement(PresetArticle, {
    preset, utility, guideHtml, steps: trace.steps, skip: trace.skip, live, related,
    // with no sponsor, the promo the app will show whatever the browser, so the page does not shift on load
    sponsor: sponsor ? sponsorElement(sponsor) : createElement(PromoBlock, { id: fixedPromo({ kind: 'preset', slug: preset.slug })! }),
    promo: inlinePromo({ kind: 'preset', slug: preset.slug }),
  }))
}

/** The inline house promo `PagePromo` shows on `page`, so the page does not shift on load. */
function inlinePromo(page: PromoPage) {
  const id = promoPlan(page).inline
  return id ? createElement(ExtraPromo, { id, slot: 'inline' }) : null
}

/** Static snapshot of `PresetsIndexPage`: the shared `PresetsIndex`. */
export function renderPresetsIndexContent(presets: PresetMeta[]): string {
  return renderToStaticMarkup(createElement(PresetsIndex, { presets, promo: inlinePromo({ kind: 'index' }) }))
}
