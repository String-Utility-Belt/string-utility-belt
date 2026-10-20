import type { Utility } from '../../types/utility'
import { resolveParams, validateParams } from '../../core/params'

const DAY = 86400_000
const HOUR = 3600_000
const formatters = new Map<string, Intl.DateTimeFormat>()
const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const pad = (n: number) => String(n).padStart(2, '0')
const iso = (t: number) => new Date(t).toISOString().replace('.000Z', 'Z')
const dateText = (t: number) => iso(t).split('T')[0]

function formatter(zone: string): Intl.DateTimeFormat {
  const cached = formatters.get(zone)
  if (cached) return cached
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: zone, hourCycle: 'h23', era: 'short',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
    formatters.set(zone, fmt)
    return fmt
  } catch (error) {
    if (error instanceof RangeError) {
      throw new Error(`Invalid time zone "${zone}": enter an IANA zone such as Europe/London.`)
    }
    throw error
  }
}

// Treat wall-clock fields as UTC solely to compare local dates/times numerically.
// setUTCFullYear avoids Date.UTC's special interpretation of years 00–99.
function wall(t: number, fmt: Intl.DateTimeFormat): number {
  const p = Object.fromEntries(fmt.formatToParts(t).map(part => [part.type, part.value]))
  const date = new Date(0)
  date.setUTCFullYear(p.era === 'BC' ? 1 - Number(p.year) : Number(p.year), Number(p.month) - 1, Number(p.day))
  date.setUTCHours(Number(p.hour), Number(p.minute), Number(p.second), 0)
  return date.getTime()
}

function offsetText(offset: number): string {
  const seconds = Math.abs(offset) / 1000
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor(seconds / 60) % 60
  const remainder = seconds % 60
  return `UTC${offset < 0 ? '-' : '+'}${pad(hours)}:${pad(minutes)}${remainder ? `:${pad(remainder)}` : ''}`
}

type Transition = { at: number; from: number; to: number; low: number; high: number }
type Finding = {
  date: string
  time: string
  kind: 'missing' | 'repeated'
  instants: string[]
  transition: { at: string; from: string; to: string }
}

function transitions(start: number, end: number, fmt: Intl.DateTimeFormat): Transition[] {
  const offset = (t: number) => wall(t, fmt) - t
  const result: Transition[] = []
  let from = offset(start)
  for (let left = start; left < end; left += 6 * HOUR) {
    const right = Math.min(left + 6 * HOUR, end)
    const to = offset(right)
    if (from !== to) {
      let lo = left
      let hi = right
      while (hi - lo > 1000) {
        const mid = lo + Math.floor((hi - lo) / 2000) * 1000
        if (offset(mid) === from) lo = mid
        else hi = mid
      }
      result.push({ at: hi, from, to, low: hi + Math.min(from, to), high: hi + Math.max(from, to) })
    }
    from = to
  }
  return result
}

function duration(ms: number): string {
  for (const [size, unit] of [[DAY, 'day'], [HOUR, 'hour'], [60_000, 'minute'], [1000, 'second']] as const) {
    if (ms % size === 0) {
      const count = ms / size
      return `${count} ${unit}${count === 1 ? '' : 's'}`
    }
  }
  return `${ms / 1000} seconds`
}

const util: Utility = {
  id: 'dst_check',
  name: 'dst check',
  category: 'Date & Time',
  description: 'Find missing or repeated local times caused by daylight saving time (DST) and other clock changes, with exact UTC instants.',
  accepts: 'string',
  produces: ['string', 'json'],
  tags: ['dst', 'daylight saving time', 'timezone', 'cron', 'clock change', 'dst checker', 'nonexistent time', 'ambiguous time', 'date', 'time', 'schedule'],
  params: {
    timeZone: { kind: 'string', label: 'time zone', default: 'Europe/London', placeholder: 'Europe/London' },
    start: { kind: 'date', label: 'start date', default: '', description: 'Empty means today in the selected time zone.' },
    days: { kind: 'number', label: 'days', default: 366, min: 1, max: 400, integer: true },
    weekday: { kind: 'select', label: 'weekday', options: ['any', ...weekdays.slice(1), 'sunday'], default: 'any' },
    format: { kind: 'select', label: 'output', options: ['text', 'json'], default: 'text' },
  },
  examples: [
    {
      title: '02:30 repeats in Belgrade and disappears in spring',
      input: '02:30',
      params: { timeZone: 'Europe/Belgrade', start: '2026-10-01', days: 200 },
      output: '2026-10-25 02:30  repeated  2026-10-25T00:30:00Z (UTC+02:00), 2026-10-25T01:30:00Z (UTC+01:00)\n2027-03-28 02:30  missing   clocks go forward 1 hour at 2027-03-28T01:00:00Z (UTC+01:00 → UTC+02:00)',
    },
    {
      title: 'New York repeats 01:30 instead',
      input: '01:30',
      params: { timeZone: 'America/New_York', start: '2026-10-01', days: 200 },
      output: '2026-11-01 01:30  repeated  2026-11-01T05:30:00Z (UTC-04:00), 2026-11-01T06:30:00Z (UTC-05:00)',
    },
    {
      title: '02:30 is missing, never repeated, in New York',
      input: '02:30',
      params: { timeZone: 'America/New_York', start: '2026-10-01', days: 200 },
      output: '2027-03-14 02:30  missing   clocks go forward 1 hour at 2027-03-14T07:00:00Z (UTC-05:00 → UTC-04:00)',
    },
  ],
  apply(input, params) {
    const resolved = resolveParams(util, params)
    const errors = validateParams(util, resolved)
    if (Object.keys(errors).length) {
      throw new Error(Object.entries(errors).map(([key, message]) => `${key}: ${message}`).join('; '))
    }
    const zone = String(resolved.timeZone).trim()
    const fmt = formatter(zone)
    const times = [...new Set(String(input).split(/\r\n?|\n/).flatMap((line, index) => {
      const time = line.trim()
      if (!time) return []
      if (!/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time)) {
        throw new Error(`Invalid time on line ${index + 1}: "${line}". Use HH:MM or HH:MM:SS (24-hour clock).`)
      }
      return [time]
    }))].sort().map(time => {
      const [h, m, s = 0] = time.split(':').map(Number)
      return { time, ms: h * HOUR + m * 60_000 + s * 1000 }
    })
    const startText = String(resolved.start).trim() || dateText(wall(Date.now(), fmt))
    const start = Date.parse(`${startText}T00:00:00Z`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startText) || !Number.isFinite(start) || dateText(start) !== startText) {
      throw new Error(`Invalid start date "${startText}": use a calendar date in YYYY-MM-DD format.`)
    }
    const end = start + Number(resolved.days) * DAY
    const changes = times.length ? transitions(start - DAY, end + DAY, fmt) : []
    const findings: Finding[] = []
    const lines: string[] = []
    // Windows are half-open wall-clock intervals. Keeping the date in the value
    // handles midnight crossings and even an entire skipped calendar day.
    for (let date = start; date < end; date += DAY) {
      if (resolved.weekday !== 'any' && weekdays[new Date(date).getUTCDay()] !== resolved.weekday) continue
      for (const { time, ms } of times) {
        const local = date + ms
        for (const change of changes) {
          if (local < change.low || local >= change.high) continue
          const { at, from, to } = change
          const missing = to > from
          const instants = missing ? [] : [local - from, local - to].sort((a, b) => a - b).map(iso)
          const transition = { at: iso(at), from: offsetText(from), to: offsetText(to) }
          const finding: Finding = { date: dateText(date), time, kind: missing ? 'missing' : 'repeated', instants, transition }
          findings.push(finding)
          const detail = missing
            ? `clocks go forward ${duration(to - from)} at ${transition.at} (${transition.from} → ${transition.to})`
            : `${instants[0]} (${transition.from}), ${instants[1]} (${transition.to})`
          lines.push(`${finding.date} ${time}  ${finding.kind.padEnd(8)}  ${detail}`)
        }
      }
    }
    if (resolved.format === 'json') return findings
    return lines.join('\n') || `No missing or repeated times for ${times.map(t => t.time).join(', ') || 'the empty time list'} in ${zone} from ${startText} through ${dateText(end - DAY)} (inclusive)${resolved.weekday === 'any' ? '' : ` on ${resolved.weekday}s`}.`
  },
}

export default util
