/**
 * The pure half of `npm run events`: the period asked for, the Analytics Engine SQL that
 * counts it, and the text report. The CLI (scripts/events.ts) does the I/O.
 */
import type { EventName } from '../../src/lib/countedEvents'

/** Must match `analytics_engine_datasets` in wrangler.jsonc. */
export const DATASET = 'sub_events'
/** Analytics Engine keeps data points for three months. */
export const MAX_DAYS = 92
export const DEFAULT_DAYS = 30

export interface Period {
  /** Inclusive start and exclusive end, UTC. */
  from: Date
  to: Date
  label: string
}

const DAY_MS = 86_400_000
const isoDay = (d: Date) => d.toISOString().slice(0, 10)

/**
 * `--days N` (the last N days, up to now) or `--month YYYY-MM` (that calendar month, UTC,
 * for a sponsor's monthly report); with neither, the last 30 days.
 */
export function parsePeriod(args: readonly string[], now: Date): Period {
  const values = new Map<string, string>()
  const flags = args.filter(a => a !== '--')
  for (let i = 0; i < flags.length; i++) {
    const flag = flags[i]
    if (flag !== '--days' && flag !== '--month') throw new Error(`unknown argument ${flag} (use --days N or --month YYYY-MM)`)
    const v = flags[++i]
    if (v === undefined || v.startsWith('--')) throw new Error(`${flag} needs a value`)
    values.set(flag, v)
  }
  const days = values.get('--days')
  const month = values.get('--month')
  if (days !== undefined && month !== undefined) throw new Error('use --days or --month, not both')

  if (month !== undefined) {
    const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month)
    if (!m) throw new Error(`--month takes YYYY-MM, not "${month}"`)
    const from = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1))
    const to = new Date(Date.UTC(Number(m[1]), Number(m[2]), 1))
    if (from > now) throw new Error(`${month} has not started yet`)
    if (now.getTime() - from.getTime() > MAX_DAYS * DAY_MS) throw new Error(`${month} is older than the ${MAX_DAYS} days Analytics Engine keeps`)
    return { from, to: to < now ? to : now, label: to < now ? month : `${month} (so far)` }
  }

  const n = days === undefined ? DEFAULT_DAYS : Number(days)
  if (!Number.isInteger(n) || n < 1 || n > MAX_DAYS) throw new Error(`--days takes a whole number from 1 to ${MAX_DAYS}`)
  return { from: new Date(now.getTime() - n * DAY_MS), to: now, label: `last ${n} day${n === 1 ? '' : 's'}` }
}

const sqlTime = (d: Date) => `toDateTime('${d.toISOString().slice(0, 19).replace('T', ' ')}')`

/** Counts per event and ids in the period, weighted by Analytics Engine's sampling. */
export function buildQuery(period: Period): string {
  return [
    'SELECT index1 AS event, blob1 AS first, blob2 AS second, SUM(_sample_interval) AS count',
    `FROM ${DATASET}`,
    `WHERE timestamp >= ${sqlTime(period.from)} AND timestamp < ${sqlTime(period.to)}`,
    'GROUP BY event, first, second',
    'ORDER BY event, count DESC',
    'FORMAT JSON',
  ].join('\n')
}

export interface Row {
  event: string
  first: string
  second: string
  count: number
}

/** The rows of the SQL API's JSON answer (counts may arrive as strings). */
export function parseRows(answer: unknown): Row[] {
  const data = (answer as { data?: unknown })?.data
  if (!Array.isArray(data)) throw new Error('the SQL API answered without a data array')
  return data.map(r => ({
    event: String(r.event ?? ''),
    first: String(r.first ?? ''),
    second: String(r.second ?? ''),
    count: Math.round(Number(r.count) || 0),
  }))
}

/**
 * Each event's column headings, matching the blob order of `eventFields`. `rollup` sums the
 * table over the second field and lists that field's totals on one line instead (a utility
 * per row, not a utility per row and source).
 */
const COLUMNS: Record<EventName, { title: string; first: string; second: string; count: string; rollup?: true }> = {
  sponsor_click: { title: 'Sponsor clicks', first: 'booking', second: 'page', count: 'clicks' },
  integration_click: { title: 'Clicks to our tools', first: 'tool', second: 'from', count: 'clicks' },
  preset_open: { title: 'Presets loaded into the editor', first: 'preset', second: 'from', count: 'loads' },
  editor_run: { title: 'Page loads that ran the editor', first: 'pipeline', second: 'steps', count: 'runs' },
  utility_add: { title: 'Utilities added to a pipeline', first: 'utility', second: 'from', count: 'adds', rollup: true },
}

/** Counts summed per key, largest first. */
function totals(rows: Row[], key: (r: Row) => string): Array<[string, number]> {
  const sums = new Map<string, number>()
  for (const r of rows) sums.set(key(r), (sums.get(key(r)) ?? 0) + r.count)
  return [...sums].sort((a, b) => b[1] - a[1])
}

function table(headings: string[], rows: string[][]): string {
  const widths = headings.map((h, i) => Math.max(h.length, ...rows.map(r => r[i].length)))
  const line = (cells: string[]) => cells.map((c, i) => (i === cells.length - 1 ? c.padStart(widths[i]) : c.padEnd(widths[i]))).join('  ').trimEnd()
  return [line(headings), line(widths.map(w => '-'.repeat(w))), ...rows.map(line)].join('\n')
}

export function formatReport(rows: Row[], period: Period): string {
  const out = [`Events, ${period.label}: ${isoDay(period.from)} to ${isoDay(new Date(period.to.getTime() - 1))} (UTC)`]
  for (const [event, cols] of Object.entries(COLUMNS) as Array<[EventName, (typeof COLUMNS)[EventName]]>) {
    const own = rows.filter(r => r.event === event)
    const total = own.reduce((n, r) => n + r.count, 0)
    out.push('', `${cols.title}: ${total}`)
    if (!own.length) continue
    if (cols.rollup) {
      out.push(table([cols.first, cols.count], totals(own, r => r.first).map(([k, n]) => [k, String(n)])))
      out.push(`By ${cols.second}: ${totals(own, r => r.second).map(([k, n]) => `${k} ${n}`).join(', ')}`)
      continue
    }
    out.push(table([cols.first, cols.second, cols.count], own.map(r => [r.first, r.second, String(r.count)])))
  }
  const other = rows.filter(r => !(r.event in COLUMNS))
  if (other.length) out.push('', `Other events (from an older or newer build): ${other.map(r => `${r.event} ${r.count}`).join(', ')}`)
  out.push('', 'Counts are weighted by Analytics Engine sampling. Sponsors see the same clicks under their UTM campaign.')
  return out.join('\n')
}
