import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { parseBlogManifest, readBlogManifest, readBlogPostSource, isSafeSlug, dropRepeatedTitle } from './blog'
import { parseFrontmatter } from '../../src/lib/markdown.js'
import { parseTags } from '../../src/components/blogManifest'

const PUBLIC_BLOG = path.join(process.cwd(), 'public', 'blog')

describe('parseBlogManifest', () => {
  it('keeps only well-formed entries', () => {
    const json = JSON.stringify([
      { slug: 'a', title: 'A' },
      { slug: '', title: 'missing slug' },
      { title: 'missing title' },
      null,
      42,
      'junk',
    ])
    expect(parseBlogManifest(json)).toEqual([{ slug: 'a', title: 'A' }])
  })

  it('returns [] for invalid JSON or a non-array', () => {
    expect(parseBlogManifest('not json')).toEqual([])
    expect(parseBlogManifest('{"slug":"a"}')).toEqual([])
  })
})

describe('readBlogManifest / readBlogPostSource (public/blog fixtures — the bug-fix location)', () => {
  it('lists the posts moved into public/blog/_manifest.json', () => {
    const posts = readBlogManifest(PUBLIC_BLOG)
    expect(posts.length).toBeGreaterThanOrEqual(2)
    expect(posts.map(p => p.slug)).toEqual(expect.arrayContaining([
      'base64-encode-decode-online', 'md5-insecure-but-useful',
    ]))
  })

  it('every manifest entry has a corresponding .md file on disk', () => {
    const posts = readBlogManifest(PUBLIC_BLOG)
    for (const post of posts) {
      expect(readBlogPostSource(PUBLIC_BLOG, post.slug)).not.toBeNull()
    }
  })

  it("lists each post's tags as its frontmatter does, so the index and the post agree", () => {
    for (const post of readBlogManifest(PUBLIC_BLOG)) {
      const { frontmatter } = parseFrontmatter(readBlogPostSource(PUBLIC_BLOG, post.slug)!)
      expect((post as { tags?: string[] }).tags, post.slug).toEqual(parseTags(frontmatter.tags))
    }
  })

  it('returns null for a slug with no file', () => {
    expect(readBlogPostSource(PUBLIC_BLOG, 'does-not-exist')).toBeNull()
  })

  it('returns [] when the manifest file is missing', () => {
    expect(readBlogManifest(path.join(process.cwd(), 'scripts', 'seo'))).toEqual([])
  })
})

describe('slug safety (slugs become output paths and URLs)', () => {
  it('accepts ordinary kebab/snake slugs', () => {
    expect(isSafeSlug('base64-encode-decode-online')).toBe(true)
    expect(isSafeSlug('md5_notes_2')).toBe(true)
  })

  it('rejects traversal, separators, and URL-significant characters', () => {
    const backslash = String.fromCharCode(92)
    for (const bad of ['..', '../../etc/passwd', 'a/b', `a${backslash}b`, 'a?b', 'a#b', 'a"b', 'a b', '.hidden', '']) {
      expect(isSafeSlug(bad)).toBe(false)
    }
  })

  it('parseBlogManifest drops entries whose slug is unsafe', () => {
    const json = JSON.stringify([
      { slug: 'ok-post', title: 'ok' },
      { slug: '../../outside', title: 'escape' },
      { slug: 'nested/post', title: 'nested' },
    ])
    expect(parseBlogManifest(json).map(p => p.slug)).toEqual(['ok-post'])
  })

  it('readBlogPostSource refuses an unsafe slug instead of reading outside the blog dir', () => {
    // resolves to a real file via `..`, so only the slug check can refuse it
    expect(readBlogPostSource(PUBLIC_BLOG, '../blog/md5-insecure-but-useful')).toBeNull()
  })
})

describe('dropRepeatedTitle', () => {
  it('drops a leading "# Title" line that repeats the frontmatter title', () => {
    expect(dropRepeatedTitle('\n# Hello\n\nBody text', 'Hello')).toBe('\nBody text')
  })

  it('keeps the heading when it differs from the title, or there is no title', () => {
    expect(dropRepeatedTitle('# Other\n\nBody', 'Hello')).toBe('# Other\n\nBody')
    expect(dropRepeatedTitle('# Hello\n\nBody', undefined)).toBe('# Hello\n\nBody')
  })

  it('leaves every shipped post with no body heading that repeats its title', () => {
    for (const post of readBlogManifest(PUBLIC_BLOG)) {
      const { frontmatter, body } = parseFrontmatter(readBlogPostSource(PUBLIC_BLOG, post.slug)!)
      const title = (frontmatter as Record<string, string>).title
      const firstLine = dropRepeatedTitle(body, title).trim().split('\n')[0]
      expect(firstLine).not.toBe(`# ${title}`)
    }
  })
})

// a post only /blog/ links to is all but invisible to a crawler (SE Ranking's "one inbound internal link")
describe('the blog manifest links every post from the utility pages it is about', () => {
  const posts = readBlogManifest(PUBLIC_BLOG)

  it.each(posts.map(p => [p.slug, p] as const))('%s names at least one utility', (_, post) => {
    expect(post.utilities?.length ?? 0).toBeGreaterThan(0)
  })

  it.each(posts.map(p => [p.slug, p] as const))('%s links each utility it names', (slug, post) => {
    const body = readBlogPostSource(PUBLIC_BLOG, slug) ?? ''
    const unlinked = (post.utilities ?? []).filter(id => !body.includes(`](/util/${id}/)`))
    expect(unlinked, 'a post names only the utilities it is about, and links them').toEqual([])
  })
})
