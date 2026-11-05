import React from 'react'
import { registry, type UtilityMeta } from '@/app/registry'
import { presetPath } from '@/presets/types'
import { utilityPath } from './related'
import { HOME_PRESETS_LEAD, POPULAR_UTILITY_IDS, displayName } from './seo'
import { PRESET_INDEX } from '@/presets/_generated/index'
import { featuredPresets } from './presets/presetHelpers'

interface Entry { href: string; name: string; description: string }

/** One block: a heading, a line about it and a "browse all" link beside a hairline link list. */
function Block({ id, title, intro, more, entries, minWidth }: {
  id: string
  title: string
  intro: string
  more: { href: string; label: string }
  entries: Entry[]
  /** Narrowest column of the link list. */
  minWidth: 'wide' | 'narrow'
}) {
  return (
    <section className="grid gap-8 lg:grid-cols-3" aria-labelledby={id}>
      <div className="grid gap-2 content-start max-w-[340px]">
        <h2 id={id} className="m-0 text-[17px] leading-6 font-semibold tracking-[-0.01em]">{title}</h2>
        <p className="m-0 text-[13px] text-muted text-pretty">{intro}</p>
        <a className="more-link mt-1.5 w-fit" href={more.href}>{more.label} <span aria-hidden>→</span></a>
      </div>
      <ul className={`m-0 p-0 list-none grid gap-x-7 lg:col-span-2 ${minWidth === 'wide'
        ? 'grid-cols-[repeat(auto-fill,minmax(min(100%,240px),1fr))]'
        : 'grid-cols-[repeat(auto-fill,minmax(min(100%,200px),1fr))]'}`}>
        {entries.map(e => (
          <li key={e.href} className="border-t">
            <a className="grid gap-px py-2.5" href={e.href}>
              <span className="text-[13.5px] font-medium">{e.name}</span>
              <span className="text-xs text-muted line-clamp-2">{e.description}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Below the pipeline editor on the home page: featured presets and the popular
 * utilities as crawlable links, so the site's most-visited page leads people (and
 * search engines) to the preset and per-utility pages. The pre-render writes the
 * same lists (`renderHomeContent`).
 */
export default function HomeDirectory() {
  const popular = POPULAR_UTILITY_IDS.map(id => registry.get(id)).filter((m): m is UtilityMeta => !!m)
  const total = registry.list().length
  const presets = featuredPresets(PRESET_INDEX)

  return (
    <div className="grid gap-10 pt-10 pb-6 border-t">
      {presets.length > 0 && (
        <Block
          id="home-presets-h"
          title="Presets"
          intro={HOME_PRESETS_LEAD}
          more={{ href: '/presets/', label: `Browse all ${PRESET_INDEX.length} presets` }}
          entries={presets.map(r => ({ href: presetPath(r.slug), name: r.name, description: r.summary }))}
          minWidth="wide"
        />
      )}
      <Block
        id="home-directory-h"
        title="Popular tools"
        intro="Every utility has its own page with a guide, worked examples and a playground."
        more={{ href: '/utilities/', label: `Browse all ${total} utilities` }}
        entries={popular.map(u => ({ href: utilityPath(u.id), name: displayName(u.name), description: u.description }))}
        minWidth="narrow"
      />
    </div>
  )
}
