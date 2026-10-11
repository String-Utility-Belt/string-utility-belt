import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { SITE_PAGES } from '@/lib/router'
import {
  TITLE_BUDGET, displayName, homeDescription, pageTitle, utilitiesDescription, utilitiesTitle, HOME_TITLE,
  DOCS_TITLE, DOCS_DESCRIPTION, BLOG_TITLE, BLOG_DESCRIPTION, CHANGELOG_TITLE, CHANGELOG_DESCRIPTION,
  PRESETS_TITLE, presetsDescription,
} from './seo'
import { parseSitePage } from './sitePages'

const sitePage = (slug: string) =>
  parseSitePage(fs.readFileSync(path.resolve(__dirname, 'content', `${slug}.md`), 'utf8'))

describe('pageTitle', () => {
  it('adds the site name when the whole title still fits a search result', () => {
    expect(pageTitle('Blog')).toBe('Blog | String Utility Belt')
    expect(pageTitle('Trim Whitespace Online: Strip Spaces')).toBe('Trim Whitespace Online: Strip Spaces | String Utility Belt')
  })

  it('keeps a long title whole rather than letting the site name push its words out of view', () => {
    const title = 'Base64 Encode Online — Convert Text to Base64'
    expect(pageTitle(title)).toBe(title)
  })

  it('does not repeat the site name', () => {
    expect(pageTitle('About String Utility Belt')).toBe('About String Utility Belt')
  })
})

describe('site copy', () => {
  // every page whose head comes from here or from a site page's frontmatter (guides, presets
  // and blog posts have their own checks): 80–160 characters, what a result snippet shows
  it('keeps titles within a search result and descriptions within a snippet', () => {
    const pages: [string, string, string][] = [
      ['home', HOME_TITLE, homeDescription(246)],
      ['utilities', utilitiesTitle(246), utilitiesDescription(246)],
      ['docs', DOCS_TITLE, DOCS_DESCRIPTION],
      ['blog', BLOG_TITLE, BLOG_DESCRIPTION],
      ['changelog', CHANGELOG_TITLE, CHANGELOG_DESCRIPTION],
      ['presets', PRESETS_TITLE, presetsDescription(40)],
      ...SITE_PAGES.map((slug): [string, string, string] => {
        const page = sitePage(slug)
        return [slug, pageTitle(page.title), page.description]
      }),
    ]
    const problems = pages.flatMap(([page, title, description]) => [
      ...(title.length > TITLE_BUDGET ? [`${page}: title is ${title.length} chars (max ${TITLE_BUDGET})`] : []),
      ...(description.length < 80 || description.length > 160 ? [`${page}: description is ${description.length} chars (80–160)`] : []),
    ])
    expect(problems).toEqual([])
  })

  it('spaces out legacy ids-as-names', () => {
    expect(displayName('base64_encode')).toBe('base64 encode')
    expect(displayName('url decode')).toBe('url decode')
  })
})
