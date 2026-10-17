import React, { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, Search, Star } from 'lucide-react'
import { registry } from '@/app/registry'
import { utilityPath } from '@/app/pages/related'
import type { UtilityMeta } from '@/core/registry'
import { compatibility } from '@/core/coerce'
import type { ValueType } from '@/types/utility'
import { searchUtilities, type FuzzyRange } from '@/app/search/fuzzy'
import Highlight from '@/app/search/Highlight'
import { useFavorites, useRecents, pushRecent } from '@/app/favorites'
import { signatureOf } from '@/app/tool/steps/status'

export interface UtilityPickerProps {
  onPick: (id: string) => void
  /** Escape in an empty search box calls this (e.g. to hide the picker). */
  onClose?: () => void
  /** The previous step's output type(s), for type-aware compatibility badges. */
  previousProduces?: ValueType[]
  /** A line above the search box saying what the pick is for. */
  title?: string
  /** Offered when a search finds nothing ("Suggest it"), with the search text. */
  onSuggest?: (query: string) => void
}

interface VisibleItem {
  key: string
  meta: UtilityMeta
  /** The group it is listed under: Starred, Recent, a category, or Results while searching. */
  group: string
  nameRanges: FuzzyRange[]
}

const NO_RANGES: FuzzyRange[] = []

interface PickerCardProps {
  optionId: string
  meta: UtilityMeta
  nameRanges: FuzzyRange[]
  index: number
  active: boolean
  favorite: boolean
  badgeLevel?: 'lossy' | 'coerce'
  badgeNote?: string
  onHover: (index: number) => void
  onPick: (id: string) => void
  onToggleFavorite: (id: string) => void
}

/**
 * One option. Memoized with primitive / stable props: hovering or arrowing through
 * ~250 rows then re-renders the two whose `active` flips, not the whole list.
 */
const PickerCard = memo(function PickerCard({
  optionId, meta, nameRanges, index, active, favorite, badgeLevel, badgeNote, onHover, onPick, onToggleFavorite,
}: PickerCardProps) {
  return (
    <div
      id={optionId}
      role="option"
      aria-selected={active}
      // named by the utility (and its badge) rather than by every control in the row
      aria-labelledby={badgeLevel ? `${optionId}-name ${optionId}-badge` : `${optionId}-name`}
      aria-description={badgeNote}
      onMouseEnter={() => onHover(index)}
      // keep focus in the search box so the arrow keys keep working after a click
      onMouseDown={e => e.preventDefault()}
      // a click on the docs link is not a pick. Not stopped at the link instead: the click
      // must bubble on to the document, where AppShell's handler follows it in-app
      onClick={e => { if (!(e.target as Element).closest('a, button')) onPick(meta.id) }}
      className={`flex items-stretch rounded-[5px] cursor-pointer hover:bg-surface-2 ${active ? 'bg-surface-2' : ''}`}
    >
      <div className="flex-1 min-w-0 grid gap-px text-left py-2 pl-2.5 pr-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span id={`${optionId}-name`} className="text-[13px] font-medium">
            <Highlight text={meta.name} ranges={nameRanges} />
          </span>
          <span className={`font-mono text-[10.5px] ${badgeLevel ? 'text-warn' : 'text-muted'}`}>{signatureOf(meta)}</span>
          {badgeLevel && (
            <span id={`${optionId}-badge`} className="font-mono text-[10.5px] text-warn" title={badgeNote}>
              {badgeLevel === 'lossy' ? 'lossy' : 'coerced'}
            </span>
          )}
        </span>
        <span className="text-xs text-muted line-clamp-2">{meta.description}</span>
      </div>
      <a
        href={utilityPath(meta.id)}
        aria-label={`${meta.name} docs`}
        title={`${meta.name} docs`}
        // one Tab stop for the whole list (the active option's controls), not one per row
        tabIndex={active ? 0 : -1}
        className="w-[30px] grid place-items-center text-muted hover:text-acc"
      >
        <BookOpen size={13} aria-hidden />
      </a>
      <button
        type="button"
        aria-label={favorite ? `Unstar ${meta.name}` : `Star ${meta.name}`}
        title={favorite ? 'Unstar' : 'Star'}
        aria-pressed={favorite}
        // same single Tab stop as the docs link: the arrow keys pick the option in the search box
        tabIndex={active ? 0 : -1}
        className={`w-[30px] grid place-items-center ${favorite ? 'text-acc' : 'text-line-2 hover:text-muted'}`}
        onClick={() => onToggleFavorite(meta.id)}
      >
        <Star size={13} fill={favorite ? 'currentColor' : 'none'} aria-hidden />
      </button>
    </div>
  )
})

export default function UtilityPicker({ onPick, onClose, previousProduces: producesProp, title, onSuggest }: UtilityPickerProps) {
  // an empty list carries no type information: behave as if none was given
  const previousProduces = producesProp?.length ? producesProp : undefined
  const [category, setCategory] = useState('All')
  const [query, setQuery] = useState('')
  const [onlyExact, setOnlyExact] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  // unique per instance: option ids back aria-activedescendant, so two pickers must not collide
  const idBase = useId()
  const listboxId = `${idBase}-listbox`

  const { favorites, toggleFavorite } = useFavorites()
  const favoriteSet = useMemo(() => new Set(favorites), [favorites])
  const { recents } = useRecents()

  useEffect(() => { inputRef.current?.focus() }, [])

  const categories = useMemo(() => ['All', ...registry.categories()], [])

  const results = useMemo(
    () => searchUtilities(query, registry.byCategory(category)),
    [category, query]
  )

  const showPinned = query.trim() === ''

  // the category chips and the "only exact matches" toggle filter every section alike
  const passesFilters = useMemo(() => (meta: UtilityMeta) =>
    (category === 'All' || meta.category === category) &&
    (!onlyExact || !previousProduces || compatibility(previousProduces, meta.accepts).level === 'exact'),
  [category, onlyExact, previousProduces])

  const favoriteMetas = useMemo(
    () => (showPinned
      ? favorites.map(id => registry.get(id)).filter((m): m is UtilityMeta => !!m && passesFilters(m))
      : []),
    [showPinned, favorites, passesFilters]
  )
  const recentMetas = useMemo(
    () => (showPinned
      ? recents.map(id => registry.get(id))
        .filter((m): m is UtilityMeta => !!m && !favorites.includes(m.id) && passesFilters(m))
      : []),
    [showPinned, recents, favorites, passesFilters]
  )
  const filteredResults = useMemo(() => {
    // pinned sections already show favorites; keep the browse list free of duplicates
    const pinned = new Set(favoriteMetas.map(m => m.id))
    return results.filter(r => !pinned.has(r.meta.id) && passesFilters(r.meta))
  }, [results, favoriteMetas, passesFilters])

  // browsing lists every utility under its category; a search lists the ranked matches together
  const resultItems = useMemo(() => {
    const items = filteredResults.map(r => ({
      key: `${idBase}-res-${r.meta.id}`, meta: r.meta, group: showPinned ? r.meta.category : 'Results', nameRanges: r.nameRanges,
    }))
    if (!showPinned) return items
    return categories.flatMap(c => items.filter(it => it.group === c))
  }, [idBase, filteredResults, showPinned, categories])

  const visible: VisibleItem[] = useMemo(() => [
    ...favoriteMetas.map(m => ({ key: `${idBase}-fav-${m.id}`, meta: m, group: 'Starred', nameRanges: NO_RANGES })),
    ...recentMetas.map(m => ({ key: `${idBase}-rec-${m.id}`, meta: m, group: 'Recent', nameRanges: NO_RANGES })),
    ...resultItems,
  ], [idBase, favoriteMetas, recentMetas, resultItems])

  // reset the active option (during render, not an effect — see the React docs on
  // "adjusting state when a prop changes") whenever the visible list changes shape
  const resetKey = `${category}\0${query}\0${onlyExact}`
  const [prevResetKey, setPrevResetKey] = useState(resetKey)
  if (resetKey !== prevResetKey) { setPrevResetKey(resetKey); setActiveIndex(0) }
  const clampedIndex = Math.max(0, Math.min(activeIndex, visible.length - 1))
  const activeId = visible[clampedIndex]?.key

  const groups = useMemo(() => {
    const out: Array<{ name: string; entries: Array<{ item: VisibleItem; idx: number }> }> = []
    visible.forEach((item, idx) => {
      const last = out[out.length - 1]
      if (last?.name === item.group) last.entries.push({ item, idx })
      else out.push({ name: item.group, entries: [{ item, idx }] })
    })
    return out
  }, [visible])

  // stable, so the memoized cards only re-render when their own props change
  const onPickRef = useRef(onPick)
  useLayoutEffect(() => { onPickRef.current = onPick })
  const pick = useCallback((id: string) => {
    pushRecent(id)
    onPickRef.current(id)
  }, [])

  const moveTo = (index: number) => {
    if (!visible.length) return
    const next = Math.max(0, Math.min(index, visible.length - 1))
    setActiveIndex(next)
    document.getElementById(visible[next].key)?.scrollIntoView?.({ block: 'nearest' })
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); moveTo(clampedIndex + 1); break
      case 'ArrowUp': e.preventDefault(); moveTo(clampedIndex - 1); break
      case 'Home': e.preventDefault(); moveTo(0); break
      case 'End': e.preventDefault(); moveTo(visible.length - 1); break
      case 'Enter': {
        // modified Enter belongs to the global shortcuts (Ctrl/Cmd+Enter = run now)
        if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) break
        const item = visible[clampedIndex]
        if (item) { e.preventDefault(); pick(item.meta.id) }
        break
      }
      case 'Escape': {
        // only an Escape the picker acted on stops here (e.g. clearing must not also close a dialog around it)
        const handle = query ? () => setQuery('') : onClose
        if (!handle) break
        e.preventDefault()
        e.stopPropagation()
        handle()
        break
      }
      default:
        break
    }
  }

  // role="none" on the list wrappers keeps listbox > group > option ownership intact
  const renderGrid = (entries: { item: VisibleItem; idx: number }[]) => (
    <ul role="none" className="grid gap-0.5 grid-cols-[repeat(auto-fill,minmax(min(100%,230px),1fr))]">
      {entries.map(({ item, idx }) => {
        const compat = previousProduces ? compatibility(previousProduces, item.meta.accepts) : null
        const badge = compat && compat.level !== 'exact' ? { level: compat.level, note: compat.note } : null
        return (
          <li role="none" key={item.key} className="min-w-0">
            <PickerCard
              optionId={item.key}
              meta={item.meta}
              nameRanges={item.nameRanges}
              index={idx}
              active={idx === clampedIndex}
              favorite={favoriteSet.has(item.meta.id)}
              badgeLevel={badge?.level}
              badgeNote={badge?.note}
              onHover={setActiveIndex}
              onPick={pick}
              onToggleFavorite={toggleFavorite}
            />
          </li>
        )
      })}
    </ul>
  )

  return (
    <div className="min-w-0 border rounded-lg bg-surface shadow-[0_16px_40px_-20px_rgb(var(--c-shadow)/var(--shadow-alpha))]">
      {title && <div className="px-3 pt-2 text-xs text-muted">{title}</div>}
      <div className="flex items-center gap-2.5 px-3 h-11 border-b">
        <Search className="shrink-0 text-muted" size={15} aria-hidden />
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded="true"
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-activedescendant={activeId}
          aria-label="Search utilities"
          className="flex-1 min-w-0 h-full bg-transparent outline-hidden text-sm"
          placeholder="Search utilities: base64, hash, json…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <kbd className="kbd hidden sm:inline">Esc</kbd>
      </div>
      {/* one scrolling row on phones: wrapped, the ~16 pills would push the list off screen.
          p-1/-m-1 keep the focus outline (2px + 2px offset) inside the scroller's clip box */}
      <div className="border-b px-2.5 py-2">
        <div className="flex items-center gap-1 -m-1 p-1 overflow-x-auto sm:flex-wrap sm:overflow-visible">
          {categories.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              aria-pressed={category === c}
              className="pill shrink-0 whitespace-nowrap h-6 px-[9px] text-xs"
            >
              {c}
            </button>
          ))}
          {previousProduces && (
            <label className="shrink-0 whitespace-nowrap ml-auto flex items-center gap-1.5 h-6 px-1.5 text-xs text-muted cursor-pointer">
              <input type="checkbox" checked={onlyExact} onChange={e => setOnlyExact(e.target.checked)} />
              only exact matches
            </label>
          )}
        </div>
      </div>
      <div role="status" className="sr-only">
        {query.trim() ? `${filteredResults.length} ${filteredResults.length === 1 ? 'utility' : 'utilities'} found` : ''}
      </div>
      <div id={listboxId} role="listbox" aria-label="utilities" className="max-h-[360px] overflow-auto p-1.5">
        {groups.map(g => (
          <div key={g.name} role="group" aria-label={g.name}>
            <div className="px-2 pt-2 pb-1 text-[11.5px] font-medium text-muted" aria-hidden>{g.name}</div>
            {renderGrid(g.entries)}
          </div>
        ))}
      </div>
      {/* after the listbox, not in it: a listbox holds only options, and this can hold a button */}
      {visible.length === 0 && (
        <div className="px-4 pt-2 pb-5 text-[13px] text-muted">
          {query.trim() ? `No utility matches “${query.trim()}”.` : 'No utilities match these filters.'}
          {query.trim() && onSuggest && (
            <>
              {' '}
              <button type="button" className="underline underline-offset-[3px] hover:text-fg" onClick={() => onSuggest(query.trim())}>
                Suggest it
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
