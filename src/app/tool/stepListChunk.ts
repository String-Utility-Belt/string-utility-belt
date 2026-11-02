/**
 * The step list as a chunk of its own: `StepList`, every step card and editor under it, and
 * framer-motion (drag reordering), which alone is ~100 KB of the entry chunk otherwise. A
 * visitor who never adds a step never needs any of it.
 *
 * - `main.tsx` waits for it (briefly) before React mounts when the tool opens on a pipeline
 *   that already has steps, so the first render shows them rather than a loading state.
 * - Otherwise `StepsSection` fetches it on the page's first pointer or key press, well before
 *   a first step can be added, and shows a short loading line if a step still beats it.
 */
import type { Route } from '@/lib/router'
import { loadState } from '@/lib/persist'
import { preloadable } from '@/app/preloadable'

export const StepList = preloadable(() => import('./StepList'))

/** Starts loading the step list when `route` opens the tool on steps; resolves when it can render. */
export function preloadStepListFor(route: Route): Promise<unknown> {
  // a shared pipeline's link carries its steps; the home page (and the not-found page, which
  // shows the tool) opens the pipeline saved in this browser
  if (route.name === 'pipeline') return StepList.preload()
  if ((route.name === 'home' || route.name === 'notFound') && loadState().steps.length > 0) return StepList.preload()
  return Promise.resolve()
}
