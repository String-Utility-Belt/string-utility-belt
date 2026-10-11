import React, { Fragment, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { registry } from '@/app/registry'
import PagePromo from '@/app/sponsors/PagePromo'
import { utilityPath } from './related'
import { UTILITIES_HEADING, displayName, utilitiesDescription, utilitiesTitle } from './seo'
import { useDocumentMeta } from './useDocumentMeta'

type Meta = ReturnType<typeof registry.list>[number]

/** Case-insensitive substring match over name, description, tags and aliases. */
function matches(u: Meta, needle: string): boolean {
  if (!needle) return true
  const n = needle.toLowerCase()
  return (
    u.name.toLowerCase().includes(n) ||
    u.id.toLowerCase().includes(n) ||
    u.description.toLowerCase().includes(n) ||
    u.tags.some(t => t.toLowerCase().includes(n)) ||
    u.aliases.some(a => a.toLowerCase().includes(n))
  )
}

const slug = (category: string) => category.replace(/\W+/g, '-').toLowerCase()
/** What the utility takes and gives, e.g. `string → bytes`. */
const signature = (u: Meta) => `${[u.accepts].flat().join(' | ')} → ${[u.produces].flat().join(' | ')}`
/** The house promo sits after this many categories. */
const PROMO_AFTER = 2

/** Every utility, filterable and grouped by category, linking to its doc page. */
export default function UtilitiesIndexPage() {
  const [q, setQ] = useState('')
  const count = registry.list().length

  // restored on leaving: pages that set no title of their own would otherwise keep this one
  useDocumentMeta(utilitiesTitle(count), utilitiesDescription(count))

  const groups = useMemo(() => {
    const needle = q.trim()
    return registry.categories()
      .map(cat => ({ category: cat, items: registry.byCategory(cat).filter(u => matches(u, needle)) }))
      .filter(g => g.items.length > 0)
  }, [q])

  const total = useMemo(() => groups.reduce((n, g) => n + g.items.length, 0), [groups])

  // buttons, not `#cat-…` links: a bare hash is a route here, so following one would leave the page
  const jumpTo = (category: string) =>
    document.getElementById(`cat-${slug(category)}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div className="grid gap-7 min-w-0">
      <header className="flex flex-wrap items-end justify-between gap-5 pb-6 border-b">
        <div className="grid gap-2 max-w-[560px]">
          <h1 className="page-title">{UTILITIES_HEADING}</h1>
          <p className="page-lead text-pretty">
            Each one has its own page with a guide, worked examples and a playground. Add any of them to a pipeline from there.
          </p>
        </div>
        <div className="grid gap-1.5 flex-[0_1_340px] min-w-[240px] max-sm:min-w-0 max-sm:basis-full">
          <label className="flex items-center gap-2.5 h-[38px] px-3 border rounded-[7px] bg-surface focus-within:border-acc">
            <Search aria-hidden size={14} className="text-muted shrink-0" />
            <input
              className="flex-1 min-w-0 border-0 outline-hidden bg-transparent text-sm"
              type="search"
              placeholder="Filter by name, description or tag"
              aria-label="Filter utilities"
              value={q}
              onChange={e => setQ(e.target.value)}
            />
          </label>
          <p role="status" aria-live="polite" className="font-mono text-[11px] text-muted">{total} of {count} utilities</p>
        </div>
      </header>

      {groups.length > 0 && (
        <nav aria-label="Categories" className="flex flex-wrap gap-1.5 -mt-2">
          {groups.map(({ category, items }) => (
            <button key={category} type="button" className="pill" onClick={() => jumpTo(category)}>
              {category}{' '}<span className="font-mono text-[10.5px] text-muted">{items.length}</span>
            </button>
          ))}
        </nav>
      )}

      {groups.length === 0 && (
        <p className="text-sm text-muted">Nothing matches “{q}”. Try a format name like base64, json or hex.</p>
      )}

      {groups.map(({ category, items }, i) => (
        <Fragment key={category}>
          <section
            id={`cat-${slug(category)}`}
            aria-labelledby={`cath-${slug(category)}`}
            className="grid gap-3 lg:grid-cols-4 lg:gap-x-8 scroll-mt-20"
          >
            <h2 id={`cath-${slug(category)}`} className="text-[17px] leading-6 font-semibold tracking-[-0.01em] lg:pt-2.5">
              {category} <span className="font-mono text-[11px] font-normal text-muted">{items.length}</span>
            </h2>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,250px),1fr))] gap-x-7 lg:col-span-3">
              {items.map(u => (
                <li key={u.id} className="border-t min-w-0">
                  {/* the pre-rendered page's crawlable path; AppShell keeps the click in the app */}
                  <a className="group grid gap-0.5 pt-2.5 pb-[11px]" href={utilityPath(u.id)}>
                    <span className="flex flex-wrap items-baseline justify-between gap-x-2.5">
                      <span className="text-[13.5px] font-medium group-hover:text-acc">{displayName(u.name)}</span>
                      <span className="font-mono text-[10.5px] text-muted whitespace-nowrap">{signature(u)}</span>
                    </span>
                    <span className="text-[12.5px] text-muted">{u.description}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
          {i === PROMO_AFTER - 1 && <PagePromo page={{ kind: 'index' }} slot="inline" />}
        </Fragment>
      ))}
    </div>
  )
}
