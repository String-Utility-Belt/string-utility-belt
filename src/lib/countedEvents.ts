/**
 * The few events the site counts itself: the contract between the app, which sends them
 * (`src/app/events/countEvent.ts`), and the Worker, which checks them and adds one to a
 * Workers Analytics Engine dataset (`worker/events.ts`). Nothing else is accepted: an
 * event is a name and a fixed set of ids, never text from the page, and carries no
 * identifier of the visitor.
 *
 * Free of imports so the Worker bundles it without the app.
 */

export const EVENT_PATH = '/api/event'

/** Larger bodies are refused unread: the longest valid event is well under this. */
export const MAX_EVENT_BYTES = 512

export const EVENT_INTEGRATIONS = ['chrome', 'vscode', 'cli', 'mcp'] as const

/**
 * Where an integration link was followed: the header, the sponsor slot while unbooked
 * (`promo`), an extra promo slot (`promo_<slot>`), the pipeline editor's promo or a preset
 * page's extension strip.
 */
export const CLICK_SOURCES = ['header', 'promo', 'promo_inline', 'promo_rail', 'promo_strip', 'promo_tool', 'preset'] as const

/** Where a preset was loaded into the editor: its own page, or the editor's Presets dialog. */
export const PRESET_SOURCES = ['page', 'gallery'] as const

/** Whose pipeline the editor ran: its own (the saved working pipeline), or a shared link's. */
export const RUN_SOURCES = ['editor', 'share'] as const

/** A pipeline's size, nested steps included, in buckets (see `stepBucket`). */
export const STEP_BUCKETS = ['1', '2-3', '4-7', '8+'] as const

export function stepBucket(steps: number): (typeof STEP_BUCKETS)[number] {
  return steps <= 1 ? '1' : steps <= 3 ? '2-3' : steps <= 7 ? '4-7' : '8+'
}

/**
 * How a utility was added to the pipeline: the utility picker, the quick-add list, the
 * command palette, Magic's suggestions or its "decode all", the empty editor's suggested
 * first steps, the suggested next step, a branch lane or "run on each" (`nested`), or a
 * utility page's "Use in pipeline".
 */
export const ADD_SOURCES = ['picker', 'quick_add', 'palette', 'magic', 'decode_all', 'suggestion', 'next_step', 'nested', 'doc_page'] as const

export type CountedEvent =
  /** A sponsor's link was followed, on a page `pageKey` names (`util/jwt_decode`). */
  | { name: 'sponsor_click'; sponsorship: string; page: string }
  /** One of our own tools' links was followed. */
  | { name: 'integration_click'; integration: (typeof EVENT_INTEGRATIONS)[number]; source: (typeof CLICK_SOURCES)[number] }
  /** A preset was loaded into the pipeline editor. */
  | { name: 'preset_open'; preset: string; source: (typeof PRESET_SOURCES)[number] }
  /** The editor produced a result the visitor asked for: at most once per page load. */
  | { name: 'editor_run'; source: (typeof RUN_SOURCES)[number]; steps: (typeof STEP_BUCKETS)[number] }
  /** A utility was added to the pipeline. */
  | { name: 'utility_add'; utility: string; source: (typeof ADD_SOURCES)[number] }

export type EventName = CountedEvent['name']

/** A utility id, preset slug or booking id: lowercase, no spaces, never free text. */
const ID = /^[a-z0-9][a-z0-9_-]{0,79}$/
const PAGE = /^(?:util|presets|blog)\/[a-z0-9][a-z0-9_-]{0,79}$/

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === 'string' && (list as readonly string[]).includes(v)
const matches = (re: RegExp, v: unknown): v is string => typeof v === 'string' && re.test(v)
const exactKeys = (o: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(o).length === keys.length && keys.every(k => Object.prototype.hasOwnProperty.call(o, k))

/** The event `raw` describes, or null for anything else: an unknown name, a missing or extra field, a value outside its set. */
export function parseCountedEvent(raw: unknown): CountedEvent | null {
  if (!isObject(raw)) return null
  switch (raw.name) {
    case 'sponsor_click':
      return exactKeys(raw, ['name', 'sponsorship', 'page']) && matches(ID, raw.sponsorship) && matches(PAGE, raw.page)
        ? { name: raw.name, sponsorship: raw.sponsorship, page: raw.page }
        : null
    case 'integration_click':
      return exactKeys(raw, ['name', 'integration', 'source']) && oneOf(EVENT_INTEGRATIONS, raw.integration) && oneOf(CLICK_SOURCES, raw.source)
        ? { name: raw.name, integration: raw.integration, source: raw.source }
        : null
    case 'preset_open':
      return exactKeys(raw, ['name', 'preset', 'source']) && matches(ID, raw.preset) && oneOf(PRESET_SOURCES, raw.source)
        ? { name: raw.name, preset: raw.preset, source: raw.source }
        : null
    case 'editor_run':
      return exactKeys(raw, ['name', 'source', 'steps']) && oneOf(RUN_SOURCES, raw.source) && oneOf(STEP_BUCKETS, raw.steps)
        ? { name: raw.name, source: raw.source, steps: raw.steps }
        : null
    case 'utility_add':
      return exactKeys(raw, ['name', 'utility', 'source']) && matches(ID, raw.utility) && oneOf(ADD_SOURCES, raw.source)
        ? { name: raw.name, utility: raw.utility, source: raw.source }
        : null
    default:
      return null
  }
}

/**
 * The event's fields in the order they are stored: `blob1`, `blob2` of the data point,
 * whose index is the event name. Reports read them back in this order.
 */
export function eventFields(e: CountedEvent): [string, string] {
  switch (e.name) {
    case 'sponsor_click': return [e.sponsorship, e.page]
    case 'integration_click': return [e.integration, e.source]
    case 'preset_open': return [e.preset, e.source]
    case 'editor_run': return [e.source, e.steps]
    case 'utility_add': return [e.utility, e.source]
  }
}
