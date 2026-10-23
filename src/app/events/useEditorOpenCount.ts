/**
 * `editor_open`: counted at most once per page load, the first time the editor is shown,
 * with whether it was the page that loaded (`load`) or a link on the site led there
 * without a reload (`link`). `editor_run`, also once per page load, divided by this is the
 * share of page loads that showed the editor and then ran a pipeline.
 */
import { useEffect } from 'react'
import { countEvent } from './countEvent'
import type { RunSource } from './useEditorRunCount'

// module scope: once per page load, however often the editor remounts
let counted = false
let navigated = false

// the router announces every in-app navigation (navigateToPath, replaceHash, history) with one
// of these; the app never navigates by itself, so any of them means the visitor followed a link
if (typeof window !== 'undefined') {
  const onNavigate = () => { navigated = true }
  window.addEventListener('popstate', onNavigate, { once: true })
  window.addEventListener('hashchange', onNavigate, { once: true })
}

/** For tests: forget that this page load counted an open, and whether it navigated. */
export function resetEditorOpenCount(arrivedByLink = false): void {
  counted = false
  navigated = arrivedByLink
}

export function useEditorOpenCount(source: RunSource): void {
  useEffect(() => {
    if (counted) return
    counted = true
    countEvent({ name: 'editor_open', source, arrival: navigated ? 'link' : 'load' })
  }, [source])
}
