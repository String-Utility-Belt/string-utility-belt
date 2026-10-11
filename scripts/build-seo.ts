/**
 * Post-build SEO pass — run after `vite build` (see `npm run build:seo`).
 *
 * Reads the built site (`--outDir <dir>` / `--outDir=<dir>` or `SEO_OUT_DIR`,
 * default `dist`) and writes pre-rendered pages, `sitemap.xml`, `rss.xml` and
 * Open Graph images into it — see `scripts/seo/build.ts`. `--no-og` skips the
 * (slow) image rendering; `--og-if-workers-ci` skips it except in a Workers
 * Builds deploy (`resolveOg`). `npm run build` runs it that way as `postbuild`,
 * so every build — including the production one — ships the pre-rendered site.
 *
 * Run with vite-node so the `@/`-aliased generated manifest/examples and the
 * markdown renderer resolve exactly as they do in the app:
 *
 *   vite-node scripts/build-seo.ts [--outDir <dir>] [--no-og]
 */
import path from 'node:path'
import { checkBuiltPages } from './csp'
import { checkDistText } from './distText'
import { siteHeaders } from './headers'
import { buildSeo } from './seo/build'

/**
 * Whether to render the (slow, ~2 min) OG images: not with `--no-og`; with
 * `--og-if-workers-ci` (how `npm run build`'s postbuild runs this) only in a
 * Cloudflare Workers Builds deploy, which sets `WORKERS_CI`; otherwise always.
 */
export function resolveOg(argv: string[], env: Record<string, string | undefined>): boolean {
  if (argv.includes('--no-og')) return false
  if (argv.includes('--og-if-workers-ci')) return !!env.WORKERS_CI
  return true
}

/** `--outDir <dir>`, `--outDir=<dir>`, then `SEO_OUT_DIR`, then `dist`; resolved against `root`. */
export function resolveOutDir(argv: string[], env: Record<string, string | undefined>, root: string): string {
  let dir: string | undefined
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--outDir') dir = argv[i + 1]
    else if (argv[i].startsWith('--outDir=')) dir = argv[i].slice('--outDir='.length)
  }
  const chosen = dir || env.SEO_OUT_DIR || 'dist'
  return path.isAbsolute(chosen) ? chosen : path.join(root, chosen)
}

async function main() {
  const root = process.cwd()
  const argv = process.argv.slice(2)
  const outDir = resolveOutDir(argv, process.env, root)
  const result = await buildSeo({ outDir, root, og: resolveOg(argv, process.env) })
  console.log(`[build-seo] ${result.pages} pages written in ${result.htmlMs}ms`)
  console.log(`[build-seo] ${result.ogImages} OG images rendered in ${result.ogMs}ms`)
  console.log(`[build-seo] sitemap.xml: ${result.sitemapUrls} urls; rss.xml: ${result.rssItems} items`)
  console.log(`[build-seo] outDir: ${outDir}`)
  // last, over every page including the pre-rendered ones: a page whose inline scripts the
  // CSP blocks must never deploy (it would render, but without its theme script)
  const problems = checkBuiltPages(outDir, siteHeaders(outDir)['Content-Security-Policy'] ?? '')
  if (problems.length) throw new Error(`the CSP in _headers blocks scripts on built pages:\n  ${problems.join('\n  ')}`)
  console.log('[build-seo] CSP: every built page runs only allowed scripts, every stylesheet loads only allowed fonts')
  const controls = checkDistText(outDir)
  if (controls.length) throw new Error(`built files hold raw control characters (show them with showControlChars, write them as Control Pictures in a guide):\n  ${controls.join('\n  ')}`)
  console.log('[build-seo] text: no built file holds a raw control character')
}

// only when executed as the script, not when a test imports `resolveOutDir`
if (!process.env.VITEST) {
  main().catch(e => {
    console.error(`[build-seo] ${e?.stack ?? e}`)
    process.exit(1)
  })
}
