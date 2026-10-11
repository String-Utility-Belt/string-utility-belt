/**
 * Search-facing strings shared by the app (`document.title` while a page is
 * mounted) and the pre-render (`scripts/seo/build.ts`). Google indexes the
 * rendered page, so a title set at runtime must match the static one.
 */

export const SITE_NAME = 'String Utility Belt'
export const SITE_URL = 'https://stringutilitybelt.com'

/** About what a search result shows of a title before truncating it. */
export const TITLE_BUDGET = 60

/**
 * A page's `<title>`: its own title plus the site name, unless that would not
 * fit in a search result. Google already shows the site name above each
 * result, so a truncated suffix only costs the page its own keywords.
 */
export function pageTitle(title: string): string {
  if (title.includes(SITE_NAME)) return title
  const branded = `${title} | ${SITE_NAME}`
  return branded.length <= TITLE_BUDGET ? branded : title
}

/** A utility name as a heading: legacy ids-as-names (`base64_encode`) read better spaced. */
export const displayName = (name: string): string => name.replace(/_/g, ' ')

export const HOME_TITLE = `Free Online String & Text Tools | ${SITE_NAME}`

/**
 * Index pages' `<h1>`s, shared by the app and the pre-render: the term each page ranks
 * for rather than a bare label ("Presets"). The home page's is visually hidden: the
 * editor's own pipeline name is the visible title there.
 */
export const HOME_HEADING = `${SITE_NAME}: free online string and text tools`
export const UTILITIES_HEADING = 'All text and string tools'
export const PRESETS_HEADING = 'Text pipeline presets'

export const homeDescription = (count: number): string =>
  `${count} free string and text tools that run in your browser: encode, decode, hash, format and convert text: Base64, URL, JSON, SHA-256 and more.`

export const utilitiesTitle = (count: number): string => pageTitle(`${count} Free Online Text & String Tools`)

export const utilitiesDescription = (count: number): string =>
  `Browse all ${count} free text and string tools by category: encoding, decoding, hashing, ciphers, compression, data formats, line tools and generators.`

export const BLOG_TITLE = pageTitle('Blog')
export const BLOG_DESCRIPTION = `Practical guides to encoding, hashing and text processing, with examples you can run in ${SITE_NAME}.`

export const CHANGELOG_TITLE = pageTitle('Changelog')
export const CHANGELOG_DESCRIPTION =
  `Release history for ${SITE_NAME}: each version of the site, the date it shipped, and the new utilities, presets, features and fixes in it.`

/** The usage guide (`Docs`, pre-rendered at `/docs/`). */
export const DOCS_TITLE = pageTitle('How to use')
export const DOCS_DESCRIPTION =
  "Learn to chain text utilities into a pipeline, configure and reorder steps, preview each step's output, and copy, download or share the result."

/**
 * Linked from the home page (static and rendered): high-demand tools, so the
 * site's most-linked page passes its weight to the pages people search for.
 * Ids that no longer exist are skipped.
 */
export const POPULAR_UTILITY_IDS = [
  'base64_encode', 'base64_decode', 'url_encode', 'url_decode', 'json_pretty', 'json_validate',
  'jwt_decode', 'md5', 'hash', 'uuid', 'case', 'text_diff',
  'timestamp_convert', 'json_to_yaml', 'csv_to_json', 'html_entity_encode', 'regex_explain', 'password_generator',
  'lorem_ipsum', 'line_sort', 'line_dedupe', 'text_stats', 'slug', 'sql_format',
] as const

/** The preset index (`/presets/`): prebuilt multi-step pipelines for real tasks. */
export const PRESETS_TITLE = pageTitle('Text Pipeline Presets for Real Tasks')

export const presetsDescription = (count: number): string =>
  `${count} ready-made pipelines for real tasks, each step shown with its actual output. Edit any of them in your browser: nothing you paste is uploaded.`

/**
 * Presets linked from the home page and the tool's directory, in order. Slugs that
 * no longer exist are skipped.
 */
export const FEATURED_PRESET_SLUGS = [
  'decode-saml-request', 'excel-column-to-sql-in-clause', 'fix-pdf-line-breaks',
  'decode-helm-release-secret', 'unescape-stringified-json', 'nested-json-to-csv',
] as const
