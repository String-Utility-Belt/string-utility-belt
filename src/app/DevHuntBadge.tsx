import React from 'react'
import { DEVHUNT } from './listings'

/**
 * The "Featured on DevHunt" badge in the site footer: the light badge, or the dark one
 * under `.dark`, both our own copies. Free of browser APIs and hooks, so the pre-render
 * (scripts/seo/content.ts) renders the same markup; `label` is the link's accessible name.
 */
export default function DevHuntBadge({ label }: { label: string }) {
  const size = { width: DEVHUNT.width, height: DEVHUNT.height }
  return (
    <a href={DEVHUNT.href} target="_blank" rel="noopener" title={DEVHUNT.title} aria-label={label}
      className="shrink-0 rounded-[10px] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-acc">
      <img src={DEVHUNT.light} alt="" {...size} decoding="async" className="block dark:hidden" />
      <img src={DEVHUNT.dark} alt="" {...size} decoding="async" className="hidden dark:block" />
    </a>
  )
}
