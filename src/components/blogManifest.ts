/** One entry of `/blog/_manifest.json`, the list the blog index and a post's footer read. */
export type PostMeta = {
  slug: string; title: string; date?: string; description?: string; tags?: string[]
  /** Utilities the post is about: their doc pages link to it (`src/utilities/_generated/posts.ts`). */
  utilities?: string[]
}

/** Keeps only well-formed manifest entries (and string tags), so a bad manifest can't crash a page. */
export function toPosts(data: unknown): PostMeta[] {
  if (!Array.isArray(data)) return []
  return data
    .filter((p): p is PostMeta =>
      !!p && typeof p === 'object' && typeof p.slug === 'string' && !!p.slug && typeof p.title === 'string')
    .map(p => ({ ...p, tags: Array.isArray(p.tags) ? p.tags.filter((t): t is string => typeof t === 'string' && !!t) : [] }))
}

/** The manifest's posts, or `[]` when it can't be read. Never rejects. */
export function fetchPosts(): Promise<PostMeta[]> {
  return Promise.resolve()
    .then(() => fetch('/blog/_manifest.json'))
    .then(r => r.json())
    .then(toPosts)
    .catch(() => [])
}

/** Frontmatter `tags: [md5, hashing]` (or a bare comma list) → `['md5', 'hashing']`. */
export function parseTags(raw: string | undefined): string[] {
  if (!raw) return []
  return raw.replace(/^\[|\]$/g, '').split(',')
    .map(t => t.trim().replace(/^(["'])(.*)\1$/, '$2'))
    .filter(Boolean)
}

/** A thread about a post on another site: its URL, and the site's name as the link's text. */
export type DiscussLink = { href: string; label: string }

/** The sites a post's `discuss` frontmatter may link to, by host. */
const DISCUSSION_SITES = new Map([
  ['dev.to', 'DEV'],
  ['reddit.com', 'Reddit'],
  ['www.reddit.com', 'Reddit'],
  ['old.reddit.com', 'Reddit'],
  ['news.ycombinator.com', 'Hacker News'],
])

/**
 * Frontmatter `discuss: [https://dev.to/…, https://news.ycombinator.com/item?id=…]` (the list
 * syntax of `tags`) → the threads a post's end links to. Only plain https links to one of
 * `DISCUSSION_SITES` are kept, the first on each site: the link's text is the site's name,
 * which would mislabel a link anywhere else, and two links on one site would read the same.
 */
export function discussLinks(raw: string | undefined): DiscussLink[] {
  const links: DiscussLink[] = []
  for (const item of parseTags(raw)) {
    let url: URL
    try {
      url = new URL(item)
    } catch {
      continue
    }
    const label = DISCUSSION_SITES.get(url.hostname)
    if (!label || url.protocol !== 'https:' || url.port || url.username || url.password) continue
    if (!links.some(l => l.label === label)) links.push({ href: url.href, label })
  }
  return links
}
