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
 *   carries no inline event handler or `javascript:` URL, which no hash can allow; and
 *   every built stylesheet loads its `@font-face` files only from sources `font-src` allows
 *   (the fonts are self-hosted: a `data:` URI or a CDN would be blocked in production).
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

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

// a browser ends script data at `</script` followed by whitespace, `/` or `>`, attributes and all
const SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script(?:[\t\n\f\r /][^>]*)?>/gi
/** `type` values a browser executes; anything else (`application/json`, `application/ld+json`) is a data block. */
const EXECUTABLE_TYPES = new Set(['', 'module', 'text/javascript', 'application/javascript', 'text/ecmascript', 'application/ecmascript'])

function attr(attrs: string, name: string): string | undefined {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(attrs)
  if (m) return m[1] ?? m[2] ?? m[3]
  return new RegExp(`(?:^|\\s)${name}(?:\\s|$)`, 'i').test(attrs) ? '' : undefined
}

/** The text of every inline script in `html` that a browser would execute. */
export function inlineScripts(html: string): string[] {
  const out: string[] = []
  for (const [, attrs, body] of html.matchAll(SCRIPT)) {
    if (attr(attrs, 'src') !== undefined) continue
    const type = (attr(attrs, 'type') ?? '').trim().toLowerCase()
    if (EXECUTABLE_TYPES.has(type)) out.push(body)
  }
  return out
}

/** Every problem the policy would cause on this page; empty when it runs as built. */
export function pageViolations(html: string, policy: string): string[] {
  const allowed = new Set(parseCsp(policy).get('script-src') ?? [])
  const problems: string[] = []
  for (const script of inlineScripts(html)) {
    const hash = hashSource(script)
    if (!allowed.has(hash)) {
      problems.push(`inline script ${hash} is not in the CSP's script-src: "${script.trim().slice(0, 80)}…"`)
    }
  }
  // script contents (data blocks included) are not markup: drop them before looking at attributes
  const markup = html.replace(SCRIPT, '<script></script>')
  for (const m of markup.matchAll(/<[a-z][^>]*?\s(on[a-z]+)\s*=/gi)) {
    problems.push(`inline event handler ${m[1]}= is blocked by the CSP (no hash can allow it): ${m[0].slice(0, 80)}`)
  }
  for (const m of markup.matchAll(/\s(?:href|src|action|formaction)\s*=\s*["']?\s*javascript:/gi)) {
    problems.push(`javascript: URL is blocked by the CSP: ${m[0].trim()}`)
  }
  return problems
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
