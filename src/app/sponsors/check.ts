/**
 * Rules every booking in `SPONSORSHIPS` must pass (run by `sponsors.test.ts`): what
 * /advertise/ promises sponsors and visitors, enforced. Not imported by the app.
 */
import { LOGO_DIR, MAX_LOGO_BYTES, MAX_SPONSOR_NAME, MAX_SPONSOR_TEXT, type Sponsorship } from './sponsors'
import { SPONSOR_TOPICS } from './topics'

const DAY = /^\d{4}-\d{2}-\d{2}$/
const isDay = (s: string) => DAY.test(s) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s)
const LOGO_FILE = /^[a-z0-9][a-z0-9-]*\.(svg|png|webp)$/
/** An SVG logo is served from this origin: opened on its own it is a document, so it must hold no script or external reference. */
const UNSAFE_SVG = /<script|<foreignObject|\bon[a-z]+\s*=|javascript:|(?:href|src)\s*=\s*["']?\s*(?:[a-z][a-z0-9+.-]*:|\/\/)/i

/** Whether an SVG served from this origin could run code or load anything (sponsor logos, listing badges). */
export const isUnsafeSvg = (svg: string): boolean => UNSAFE_SVG.test(svg)

/**
 * Every problem with these bookings. `logo(file)` returns the file's bytes from
 * `public/sponsors/`, or undefined when it does not exist.
 */
export function sponsorshipProblems(list: readonly Sponsorship[], logo: (file: string) => Uint8Array | undefined): string[] {
  const problems: string[] = []
  const ids = new Set<string>()
  for (const s of list) {
    const at = `sponsorship ${s.id}`
    if (!/^[a-z0-9][a-z0-9-]*$/.test(s.id)) problems.push(`${at}: id must be lowercase letters, digits and hyphens`)
    if (ids.has(s.id)) problems.push(`${at}: duplicate id`)
    ids.add(s.id)
    if (s.scope !== 'site' && !(s.scope in SPONSOR_TOPICS)) problems.push(`${at}: unknown scope ${s.scope}`)
    if (!s.name.trim() || s.name.length > MAX_SPONSOR_NAME || /\n/.test(s.name)) {
      problems.push(`${at}: name must be one line of 1–${MAX_SPONSOR_NAME} characters`)
    }
    if (!s.text.trim() || s.text.length > MAX_SPONSOR_TEXT || /\n/.test(s.text)) {
      problems.push(`${at}: text must be one line of 1–${MAX_SPONSOR_TEXT} characters`)
    }
    let url: URL | undefined
    try { url = new URL(s.url) } catch { /* reported below */ }
    if (!url || url.protocol !== 'https:' || url.username || url.password) problems.push(`${at}: url must be an https link without credentials`)
    if (!isDay(s.start) || !isDay(s.end) || s.start > s.end) problems.push(`${at}: start and end must be YYYY-MM-DD days, start ≤ end`)
    if (!LOGO_FILE.test(s.logo)) {
      problems.push(`${at}: logo must be a file name in public${LOGO_DIR} ending .svg, .png or .webp`)
    } else {
      const bytes = logo(s.logo)
      if (!bytes) problems.push(`${at}: logo public${LOGO_DIR}${s.logo} does not exist`)
      else if (bytes.byteLength > MAX_LOGO_BYTES) problems.push(`${at}: logo is over ${MAX_LOGO_BYTES / 1024} KB`)
      else if (s.logo.endsWith('.svg') && isUnsafeSvg(new TextDecoder().decode(bytes))) {
        problems.push(`${at}: SVG logo contains a script, event handler or external reference`)
      }
    }
  }
  // exclusivity: one booking per scope on any day
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j]
      if (a.scope === b.scope && a.start <= b.end && b.start <= a.end) {
        problems.push(`sponsorships ${a.id} and ${b.id} both hold ${a.scope} on overlapping days`)
      }
    }
  }
  return problems
}
