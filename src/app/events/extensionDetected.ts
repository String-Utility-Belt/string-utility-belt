/**
 * `extension_detected`: counted when the browser extension answers the page's ping
 * (src/app/extension/bridge.ts), which happens at most once per page load. It records only
 * the extension's version and what kind of page found it. Like `editor_open` it counts page
 * loads, not people: `extension_detected` with page `editor`, divided by `editor_open`, is the
 * share of editor loads from a browser that has the extension.
 */
import type { CountedEvent } from '@/lib/countedEvents'
import { getRoute, type RouteName } from '@/lib/router'
import { countEvent } from './countEvent'

export type PageKind = Extract<CountedEvent, { name: 'extension_detected' }>['page']

const PAGE_KINDS: Partial<Record<RouteName, PageKind>> = {
  home: 'editor',
  pipeline: 'editor',
  utility: 'utility',
  utilities: 'utility',
  preset: 'preset',
  presets: 'preset',
}

export const pageKind = (route: RouteName): PageKind => PAGE_KINDS[route] ?? 'other'

export function countExtensionDetected(version: string): void {
  countEvent({ name: 'extension_detected', version, page: pageKind(getRoute().name) })
}
