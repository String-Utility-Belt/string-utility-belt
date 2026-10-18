import React, { Fragment, type MouseEvent } from 'react'
import { FEEDBACK_HREF, openFeedbackFromLink } from '@/app/feedback/open'
import type { DiscussLink } from './blogManifest'

// as the post's own links (`.md .md-link`), which this sits just after
const LINK = 'underline decoration-acc underline-offset-[3px] hover:text-acc'

/** What goes before the link at `i` of `n`: "DEV", "DEV and Reddit", "DEV, Reddit and Hacker News". */
const separator = (i: number, n: number): string => (i === 0 ? '' : i === n - 1 ? ' and ' : ', ')

// a correction to a post is neither a utility suggestion (the form's default) nor a bug in the tool
const openPostFeedback = (e: MouseEvent<HTMLAnchorElement>) => openFeedbackFromLink(e, { kind: 'other' })

/**
 * The end of a blog post: where it is discussed (its `discuss` frontmatter, through
 * `discussLinks`; no line at all when it lists none), then a feedback link that opens the form
 * over the post, as the footer's does. Rendered by the app (`BlogPost`) and by the pre-render
 * (`scripts/seo/content.ts`), so both show the same markup.
 */
export default function PostDiscussion({ links }: { links: readonly DiscussLink[] }) {
  return (
    <div className="grid gap-1 text-[14.5px] leading-6 text-muted">
      {links.length > 0 && (
        <p className="m-0">
          Discuss this post on{' '}
          {links.map((l, i) => (
            <Fragment key={l.href}>
              {separator(i, links.length)}
              <a href={l.href} target="_blank" rel="noopener" className={LINK} aria-label={`${l.label} (opens in a new tab)`}>{l.label}</a>
            </Fragment>
          ))}
          .
        </p>
      )}
      <p className="m-0">
        Spotted a mistake? <a href={FEEDBACK_HREF} className={LINK} onClick={openPostFeedback}>Send feedback</a>.
      </p>
    </div>
  )
}
