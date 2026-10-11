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
