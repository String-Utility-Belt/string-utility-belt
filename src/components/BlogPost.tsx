import React, { useEffect, useState } from 'react'
import { parseFrontmatter } from '@/lib/markdown'
import { useT } from '@/app/i18n/useT'
import { renderMarkdownDocument } from '@/app/pages/guide'
import { pageTitle } from '@/app/pages/seo'
import PagePromo from '@/app/sponsors/PagePromo'
import PageSponsor from '@/app/sponsors/PageSponsor'
import { discussLinks, fetchPosts, parseTags, type PostMeta } from './blogManifest'
import PostDiscussion from './PostDiscussion'

type BlogPostProps = { slug: string }
type Frontmatter = Record<string, string>
type Loaded =
  | { slug: string; status: 'ok'; meta: Frontmatter; html: string }
  | { slug: string; status: 'missing' }

/** Posts open with `# <title>`, which the header already renders — don't show it twice. */
function dropRepeatedTitle(body: string, title: string | undefined): string {
  const first = /^\s*#[ \t]+(.+?)[ \t]*(?:\r?\n|$)/.exec(body)
  return title && first && first[1] === title ? body.slice(first[0].length) : body
}

/** How many other posts the footer lists. */
const MORE_POSTS = 3

// exact match only: `md-code-block` (fenced blocks; already scrollable via its `.md-pre`
// ancestor) must not pick this up — only bare inline `` `code` `` spans. Unlike a fenced
// block, an inline span sits inside ordinary wrapping text, where a long unbroken token
// (a file path, an identifier) would otherwise force this narrow article wider than the
// viewport.
const withWrappableInlineCode = (html: string) => html.replace(/class="md-code"/g, 'class="md-code wrap-break-word"')

export default function BlogPost({ slug }: BlogPostProps) {
  const { t, formatDate } = useT()
  // tagged with its slug so a stale result (or error) from the previous post
  // is never shown while the next one loads
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const post = loaded?.slug === slug ? loaded : null
  const [allPosts, setAllPosts] = useState<PostMeta[]>([])

  useEffect(() => {
    let active = true
    fetchPosts().then(list => { if (active) setAllPosts(list) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    fetch(`/blog/${slug}.md`)
      .then(r => {
        // a dev server / SPA fallback answers a missing .md with index.html
        const type = r.headers?.get?.('content-type') ?? ''
        if (!r.ok || type.includes('text/html')) throw new Error('not found')
        return r.text()
      })
      .then(txt => {
        if (!active) return
        const { frontmatter, body } = parseFrontmatter(txt) as { frontmatter: Frontmatter; body: string }
        // lists and tables as in the guides; the same renderer pre-renders /blog/<slug>/
        const html = withWrappableInlineCode(renderMarkdownDocument(dropRepeatedTitle(body, frontmatter.title)))
        setLoaded({ slug, status: 'ok', meta: frontmatter, html })
        if (frontmatter.title) document.title = pageTitle(frontmatter.title)
        if (frontmatter.description) {
          let metaDesc = document.querySelector('meta[name="description"]')
          if (!metaDesc) { metaDesc = document.createElement('meta'); metaDesc.setAttribute('name', 'description'); document.head.appendChild(metaDesc) }
          metaDesc.setAttribute('content', frontmatter.description)
        }
      })
      .catch(() => { if (active) setLoaded({ slug, status: 'missing' }) })
    return () => { active = false }
  }, [slug])

  const meta = post?.status === 'ok' ? post.meta : null
  const tags = parseTags(meta?.tags)
  const others = allPosts.filter(p => p.slug !== slug).slice(0, MORE_POSTS)
  const date = (iso: string) => <time dateTime={iso}>{formatDate(iso, { dateStyle: 'long' })}</time>
  // w-full + min-w-0: `max-w-[720px] mx-auto` alone leaves this grid item's width "auto",
  // which — with a non-wrapping code block inside (.md-pre already scrolls itself) —
  // grid sizes via shrink-to-fit up to the block's min-content width, blowing the article
  // (and the page) wider than the viewport instead of clipping to the grid track
  return (
    <article className="w-full max-w-[720px] mx-auto grid gap-7 min-w-0" aria-busy={post ? undefined : true}>
      {!post && <p className="muted" role="status">{t('common.loading')}</p>}
      {post?.status === 'missing' && (
        <div className="grid gap-3">
          <p className="text-[15px] text-danger-ink" role="alert">{t('blog.notFound')}</p>
          <a className="more-link justify-self-start" href="/blog/">All posts <span aria-hidden="true">→</span></a>
        </div>
      )}
      {meta && (
        <header className="grid gap-3 pb-6 border-b">
          <nav aria-label="Breadcrumb" className="text-[12.5px]">
            <a href="/blog/" className="text-muted hover:text-fg">{t('blog.title')}</a>
          </nav>
          {meta.title && <h1 className="m-0 text-[28px] leading-[34px] sm:text-[34px] sm:leading-10 font-semibold tracking-[-0.025em] text-balance">{meta.title}</h1>}
          {meta.description && <p className="m-0 text-base leading-[26px] text-muted text-pretty">{meta.description}</p>}
          {(meta.date || tags.length > 0) && (
            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 font-mono text-[11.5px] text-muted">
              {meta.date && (
                <span>
                  {date(meta.date)}
                  {meta.updated && meta.updated !== meta.date && <> · updated {date(meta.updated)}</>}
                </span>
              )}
              {tags.length > 0 && (
                <span className="flex flex-wrap gap-1.5">{tags.map(tag => <span key={tag} className="chip">{tag}</span>)}</span>
              )}
            </div>
          )}
          <PageSponsor page={{ kind: 'blog', slug }} className="mt-2" />
        </header>
      )}
      {post?.status === 'ok' && (
        <>
          <div className="md [&>:first-child]:mt-0" dangerouslySetInnerHTML={{ __html: post.html }} />
          <PagePromo page={{ kind: 'blog', slug }} slot="inline" />
          <footer className="grid gap-6 pt-6 border-t">
            <PostDiscussion links={discussLinks(post.meta.discuss)} />
            {others.length > 0 && (
              <div className="grid gap-1">
                <h2 className="m-0 text-xs font-normal text-muted">Also on the blog</h2>
                {others.map(p => (
                  <a key={p.slug} href={`/blog/${p.slug}/`} className="text-base leading-6 font-semibold hover:text-acc">{p.title}</a>
                ))}
              </div>
            )}
          </footer>
        </>
      )}
    </article>
  )
}
