import React, { useEffect, useMemo } from 'react'
import { scrollToFragment, type SitePageSlug } from '@/lib/router'
import { writePref } from '@/app/prefs'
import { INTEGRATIONS_SEEN_PREF } from '@/app/integrations/links'
import PagePromo from '@/app/sponsors/PagePromo'
import FeedbackForm from '@/app/feedback/FeedbackForm'
// Vite `?raw` imports: the same markdown `scripts/seo/build.ts` pre-renders into /<slug>/
import about from './content/about.md?raw'
import privacy from './content/privacy.md?raw'
import contact from './content/contact.md?raw'
import integrations from './content/integrations.md?raw'
import advertise from './content/advertise.md?raw'
import { parseSitePage } from './sitePages'
import { useDocumentMeta } from './useDocumentMeta'
import { pageTitle } from './seo'

const SOURCES: Record<SitePageSlug, string> = { about, privacy, contact, integrations, advertise }

/** A page this long gets an "On this page" list beside it. */
const TOC_MIN_SECTIONS = 3

/** The contact page's form, after its text: the footer's Feedback link opens `/contact/#feedback` without scripts. */
const FEEDBACK_SECTION = { id: 'feedback', title: 'Send us a message' }

// the markdown's own `# heading` (the page's h1) styled as the page title, ruled off from the text
const TITLE = [
  '[&>.md-h1:first-child]:mt-0', '[&>.md-h1:first-child]:mb-6', '[&>.md-h1:first-child]:pb-5',
  '[&>.md-h1:first-child]:border-b', '[&>.md-h1:first-child]:text-[26px]', '[&>.md-h1:first-child]:leading-8',
  'sm:[&>.md-h1:first-child]:text-[32px]', 'sm:[&>.md-h1:first-child]:leading-[38px]',
  '[&>.md-h1:first-child]:tracking-[-0.025em]', '[&>.md-h1:first-child]:text-balance',
].join(' ')

/** About, privacy policy, contact, integrations and advertise: static markdown pages in the site chrome. */
export default function SitePage({ slug }: { slug: SitePageSlug }) {
  const page = useMemo(() => parseSitePage(SOURCES[slug]), [slug])
  useDocumentMeta(pageTitle(page.title), page.description)
  // this page renders after navigation (a lazy chunk), so it opens its own #section
  useEffect(() => { scrollToFragment() }, [page.html])
  // the header's integrations group stops marking itself new once its page is read
  useEffect(() => { if (slug === 'integrations') writePref(INTEGRATIONS_SEEN_PREF, true) }, [slug])

  const sections = slug === 'contact' ? [...page.sections, FEEDBACK_SECTION] : page.sections
  const toc = sections.length >= TOC_MIN_SECTIONS

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,740px)_200px] items-start">
      {/* w-full + min-w-0, as for blog posts: keeps a long code span or table inside the grid track */}
      <article className="w-full max-w-[740px] min-w-0">
        {/* trusted: renderMarkdownDocument escapes every character of the source */}
        <div className={`md ${TITLE}`} dangerouslySetInnerHTML={{ __html: page.html }} />
        {slug === 'contact' && (
          <section id={FEEDBACK_SECTION.id} aria-labelledby={`${FEEDBACK_SECTION.id}-title`} className="mt-10 pt-8 border-t grid gap-5 scroll-mt-20">
            <h2 id={`${FEEDBACK_SECTION.id}-title`} className="m-0 text-xl leading-7 font-semibold tracking-[-0.015em]">{FEEDBACK_SECTION.title}</h2>
            <FeedbackForm />
          </section>
        )}
      </article>
      {toc && (
        <div className="hidden lg:grid gap-5 sticky top-[84px]">
          <nav aria-label="On this page" className="grid gap-px pl-4 border-l text-[13px]">
            <span className="pb-2 text-[11.5px] font-medium text-muted">On this page</span>
            {/* real in-page links: the app's link handler keeps the click in the app and scrolls */}
            {sections.map(s => (
              <a key={s.id} href={`/${slug}/#${s.id}`} className="py-1 text-muted hover:text-fg">{s.title}</a>
            ))}
          </nav>
          {/* the sponsorship sales page carries no promo of ours */}
          {slug !== 'advertise' && <PagePromo page={{ kind: 'index' }} slot="rail" />}
        </div>
      )}
    </div>
  )
}
