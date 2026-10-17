import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

export interface BlogPostMeta {
  slug: string
  title: string
  description?: string
  date?: string
  /** Utilities the post is about: their pages link to it ("From the blog", via `npm run gen`). */
  utilities?: string[]
}

const SAFE_SLUG = /^[A-Za-z0-9][A-Za-z0-9_-]*$/

/**
 * A slug becomes both an output directory (`blog/<slug>/index.html`) and a URL
 * segment, so only plain `[A-Za-z0-9_-]` names (no `.`/`..`, separators, `?`, `#`)
 * are accepted.
 */
export function isSafeSlug(slug: string): boolean {
  return SAFE_SLUG.test(slug)
}

/**
 * Keeps only well-formed manifest entries, matching `BlogIndex`'s tolerance for
 * a bad manifest, and drops any whose slug is not `isSafeSlug`.
 */
export function parseBlogManifest(json: string): BlogPostMeta[] {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    return []
  }
  if (!Array.isArray(data)) return []
  return data.filter((p): p is BlogPostMeta =>
    !!p && typeof p === 'object' && typeof (p as BlogPostMeta).slug === 'string' &&
    isSafeSlug((p as BlogPostMeta).slug) && typeof (p as BlogPostMeta).title === 'string')
}

/** Reads `<blogDir>/_manifest.json`; returns `[]` if missing or malformed. */
export function readBlogManifest(blogDir: string): BlogPostMeta[] {
  const file = path.join(blogDir, '_manifest.json')
  if (!existsSync(file)) return []
  return parseBlogManifest(readFileSync(file, 'utf8'))
}

const POST_IMAGE = /^\/blog\/([A-Za-z0-9][A-Za-z0-9_-]*\.png)$/

/**
 * A post's own preview image, from its frontmatter `image`: a PNG beside the posts,
 * written as `/blog/<name>.png`. Anything else (another directory or type, a file that
 * isn't there) is `undefined`, and the post keeps its generated card. The page's
 * og:image tags say 1200x630, which blog.test.ts checks for every shipped post.
 */
export function postImage(value: string | undefined, blogDir: string): string | undefined {
  const m = value ? POST_IMAGE.exec(value) : null
  return m && existsSync(path.join(blogDir, m[1])) ? value : undefined
}

/** Reads `<blogDir>/<slug>.md` verbatim (frontmatter + body); `null` if missing or the slug is unsafe. */
export function readBlogPostSource(blogDir: string, slug: string): string | null {
  if (!isSafeSlug(slug)) return null
  const file = path.join(blogDir, `${slug}.md`)
  return existsSync(file) ? readFileSync(file, 'utf8') : null
}

/**
 * Drops a leading `# <title>` line that repeats the frontmatter title — the
 * page renders the title itself (mirrors `BlogPost`'s client-side rendering).
 */
export function dropRepeatedTitle(body: string, title: string | undefined): string {
  const first = /^\s*#[ \t]+(.+?)[ \t]*(?:\r?\n|$)/.exec(body)
  return title && first && first[1] === title ? body.slice(first[0].length) : body
}
