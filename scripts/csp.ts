/**
 * Checks that the site's Content-Security-Policy (`public/_headers`) allows every
 * script the pages actually run. The policy allows inline scripts by SHA-256 only —
 * no 'unsafe-inline' — so an edited inline script, or a new one, is blocked in
 * production unless its hash is added. Two guards use this module:
 *
 * - `scripts/csp.test.ts` (`npm test`): the hashes in `_headers` are exactly those of
 *   `index.html`'s inline scripts and the custom-code sandbox's bootstrap, and the
 *   failure names the hash to add or remove.
 * - `scripts/build-seo.ts` (every `npm run build`, so every deploy): every built page —
 *   the SPA shell and each pre-rendered page — runs only allowed inline scripts and
 *   carries no inline event handler or `javascript:` URL, which the policy blocks (it has
 *   neither 'unsafe-inline' nor 'unsafe-hashes'); and every built stylesheet loads its
 *   `@font-face` files only from sources `font-src` allows (the fonts are self-hosted: a
 *   `data:` URI or a CDN would be blocked in production).
 *
 * Pages are parsed with parse5, which implements the HTML standard's parsing algorithm,
 * so a script ends, a comment hides markup and a `<noscript>` holds raw text exactly
 * where they do for a browser, and scripts inside `<template>` and `<svg>` are found too.
 * Which scripts run follows the standard's "prepare the script element" rules.
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { defaultTreeAdapter as tree, html, parse, type DefaultTreeAdapterMap } from 'parse5'

type ParentNode = DefaultTreeAdapterMap['parentNode']
type Element = DefaultTreeAdapterMap['element']
type Template = DefaultTreeAdapterMap['template']

/** Directive name → its source list, from a serialized policy. */
export function parseCsp(policy: string): Map<string, string[]> {
  const directives = new Map<string, string[]>()
  for (const part of policy.split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/)
    if (name && !directives.has(name.toLowerCase())) directives.set(name.toLowerCase(), sources)
  }
  return directives
}

/**
 * The CSP hash source of an inline script's text. Browsers normalize CRLF and CR to LF
 * before parsing HTML, so the hash is of the text after that, as the browser sees it.
 */
export function hashSource(script: string): string {
  const text = script.replace(/\r\n?/g, '\n')
  return `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`
}

/** Every element of the page in document order, the contents of `<template>`s included. */
function* elements(parent: ParentNode): Generator<Element> {
  for (const node of tree.getChildNodes(parent)) {
    if (!tree.isElementNode(node)) continue
    yield node
    yield* elements(isTemplate(node) ? tree.getTemplateContent(node) : node)
  }
}

const isTemplate = (el: Element): el is Template => el.tagName === 'template' && el.namespaceURI === html.NS.HTML

const attr = (el: Element, name: string): string | undefined => el.attrs.find(a => a.name === name && !a.prefix)?.value

const asciiLower = (s: string) => s.replace(/[A-Z]/g, c => c.toLowerCase())

/** The HTML standard's JavaScript MIME type essences: a script whose type is one of them runs as a classic script. */
const JAVASCRIPT_TYPES = new Set([
  'application/ecmascript', 'application/javascript', 'application/x-ecmascript', 'application/x-javascript',
  'text/ecmascript', 'text/javascript', 'text/javascript1.0', 'text/javascript1.1', 'text/javascript1.2',
  'text/javascript1.3', 'text/javascript1.4', 'text/javascript1.5', 'text/jscript', 'text/livescript',
  'text/x-ecmascript', 'text/x-javascript',
])
/** The other script types a browser processes, each checked against script-src; any other type is a data block. */
const OTHER_SCRIPT_TYPES = new Set(['module', 'importmap', 'speculationrules'])

/**
 * Whether a browser runs this `<script>`'s own text: it has no external source, and its
 * type, worked out as "prepare the script element" does (an empty or missing `type` is
 * JavaScript, a `language` stands in for a missing one), is one a browser processes.
 */
function runsInline(el: Element): boolean {
  if (el.tagName !== 'script' || (el.namespaceURI !== html.NS.HTML && el.namespaceURI !== html.NS.SVG)) return false
  if (el.namespaceURI === html.NS.HTML ? attr(el, 'src') !== undefined : el.attrs.some(a => a.name === 'href')) return false
  const type = attr(el, 'type')
  const language = el.namespaceURI === html.NS.HTML ? attr(el, 'language') : undefined
  let essence = 'text/javascript'
  if (type) essence = type.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, '')
  else if (type === undefined && language) essence = `text/${language}`
  essence = asciiLower(essence)
  return JAVASCRIPT_TYPES.has(essence) || OTHER_SCRIPT_TYPES.has(essence)
}

/** A script's own text, as its CSP hash is computed over. */
const scriptText = (el: Element) => tree.getChildNodes(el).filter(tree.isTextNode).map(tree.getTextNodeContent).join('')

/** A URL attribute's value as the URL parser reads it: outer C0 controls and spaces, and every tab and newline, dropped. */
// eslint-disable-next-line no-control-regex -- control characters are what this matches
const urlOf = (value: string) => value.replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g, '').replace(/[\t\n\r]/g, '')

const URL_ATTRIBUTES = new Set(['href', 'src', 'action', 'formaction', 'data'])

/** The text of every inline script in `html` that a browser would run. */
export function inlineScripts(html: string): string[] {
  return [...elements(parse(html))].filter(runsInline).map(scriptText)
}

/** Every problem the policy would cause on this page; empty when it runs as built. */
export function pageViolations(page: string, policy: string): string[] {
  const allowed = new Set(parseCsp(policy).get('script-src') ?? [])
  const scripts: string[] = []
  const handlers: string[] = []
  const urls: string[] = []
  for (const el of elements(parse(page))) {
    if (runsInline(el)) {
      const script = scriptText(el)
      const hash = hashSource(script)
      if (!allowed.has(hash)) scripts.push(`inline script ${hash} is not in the CSP's script-src: "${script.trim().slice(0, 80)}…"`)
    }
    for (const { name, value } of el.attrs) {
      if (/^on[a-z]+$/.test(name)) {
        handlers.push(`inline event handler ${name}= on <${el.tagName}> is blocked by the CSP: ${value.trim().slice(0, 80)}`)
      } else if (URL_ATTRIBUTES.has(name) && /^javascript:/i.test(urlOf(value))) {
        urls.push(`javascript: URL is blocked by the CSP: <${el.tagName} ${name}="${value.trim().slice(0, 80)}">`)
      }
    }
  }
  return [...scripts, ...handlers, ...urls]
}

const FONT_FACE = /@font-face\s*\{([^}]*)\}/gi
const CSS_URL = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/gi

/** Every `@font-face` file in `css` that the policy's `font-src` would block. */
export function stylesheetViolations(css: string, policy: string): string[] {
  const sources = parseCsp(policy).get('font-src') ?? parseCsp(policy).get('default-src') ?? []
  const allows = (url: string): boolean => {
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(url)?.[1]?.toLowerCase()
    if (scheme === 'data' || scheme === 'blob') return sources.includes(`${scheme}:`)
    if (scheme === 'http' || scheme === 'https' || url.startsWith('//')) {
      const origin = new URL(url, 'https://self.invalid').origin
      return sources.some(s => s.replace(/\/+$/, '') === origin) || sources.includes(`${scheme ?? 'https'}:`)
    }
    return sources.includes("'self'") // relative or root-relative: the site's own origin
  }
  const problems: string[] = []
  for (const [, body] of css.matchAll(FONT_FACE)) {
    for (const m of body.matchAll(CSS_URL)) {
      const url = (m[1] ?? m[2] ?? m[3]).trim()
      if (!allows(url)) problems.push(`@font-face source is blocked by the CSP's font-src: ${url.slice(0, 80)}`)
    }
  }
  return problems
}

function filesEndingWith(dir: string, ext: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter(e => e.isFile() && e.name.endsWith(ext))
    .map(e => path.join(e.parentPath, e.name))
}

/**
 * Checks every `.html` file under `outDir` (inline scripts, handlers, `javascript:` URLs) and
 * every `.css` file (`@font-face` sources) against `policy`; problems are prefixed with the file.
 */
export function checkBuiltPages(outDir: string, policy: string): string[] {
  const check = (ext: string, violations: (text: string, policy: string) => string[]) =>
    filesEndingWith(outDir, ext).flatMap(file =>
      violations(fs.readFileSync(file, 'utf8'), policy).map(p => `${path.relative(outDir, file)}: ${p}`))
  return [...check('.html', pageViolations), ...check('.css', stylesheetViolations)]
}
