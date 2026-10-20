import { afterEach, describe, expect, it, vi } from 'vitest'
import fc from 'fast-check'
import { validateParam } from '../../core/params'
import type { Params } from '../../types/utility'
import util from './index'

const DAY = 86400_000
const iso = (t: number) => new Date(t).toISOString().replace('.000Z', 'Z')
type Finding = {
  date: string
  time: string
  kind: 'missing' | 'repeated'
  instants: string[]
  transition: { at: string; from: string; to: string }
}
const check = async (input: string, timeZone: string, start: string, days: number, extra: Params = {}) =>
  await util.apply(input, { timeZone, start, days, format: 'json', ...extra }) as Finding[]

// Independent reference supplied with the request: try nearby offsets and
// round-trip each candidate instant through Intl, for every date and time.
function reference(date: string, time: string, tz: string): number[] {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const wall = (t: number) => {
    const p = Object.fromEntries(fmt.formatToParts(t).map(x => [x.type, x.value]))
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second)
  }
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm, ss = 0] = time.split(':').map(Number)
  const W = Date.UTC(y, m - 1, d, hh, mm, ss)
  const offsets = new Set([-36, -12, 0, 12, 36].map(h => {
    const t = W + h * 3600_000
    return wall(t) - t
  }))
  return [...offsets].map(o => W - o).filter(t => wall(t) === W).sort((a, b) => a - b)
}

afterEach(() => vi.restoreAllMocks())

describe('dst check', () => {
  it('reports the complete JSON shape for both Belgrade changes', async () => {
    expect(await check('02:30', 'Europe/Belgrade', '2026-10-01', 200)).toEqual([
      {
        date: '2026-10-25', time: '02:30', kind: 'repeated',
        instants: ['2026-10-25T00:30:00Z', '2026-10-25T01:30:00Z'],
        transition: { at: '2026-10-25T01:00:00Z', from: 'UTC+02:00', to: 'UTC+01:00' },
      },
      {
        date: '2027-03-28', time: '02:30', kind: 'missing', instants: [],
        transition: { at: '2027-03-28T01:00:00Z', from: 'UTC+01:00', to: 'UTC+02:00' },
      },
    ])
  })

  it.each([
    ['01:30', 'America/New_York', '2026-10-01', 200, [
      ['2026-11-01', 'repeated', ['2026-11-01T05:30:00Z', '2026-11-01T06:30:00Z']],
    ]],
    ['02:30', 'America/New_York', '2026-10-01', 200, [['2027-03-14', 'missing', []]]],
    ['02:15', 'Australia/Lord_Howe', '2026-09-01', 240, [['2026-10-04', 'missing', []]]],
    ['01:45', 'Australia/Lord_Howe', '2026-09-01', 240, [
      ['2027-04-04', 'repeated', ['2027-04-03T14:45:00Z', '2027-04-03T15:15:00Z']],
    ]],
    ['00:30', 'America/Havana', '2026-03-01', 300, [
      ['2026-03-08', 'missing', []],
      ['2026-11-01', 'repeated', ['2026-11-01T04:30:00Z', '2026-11-01T05:30:00Z']],
    ]],
    ['23:30', 'America/Santiago', '2026-03-01', 220, [
      ['2026-04-04', 'repeated', ['2026-04-05T02:30:00Z', '2026-04-05T03:30:00Z']],
    ]],
    ['00:30', 'America/Santiago', '2026-03-01', 220, [['2026-09-06', 'missing', []]]],
    ['12:00', 'Pacific/Apia', '2011-12-28', 5, [['2011-12-30', 'missing', []]]],
  ] as const)('checks %s in %s', async (time, zone, start, days, expected) => {
    expect((await check(time, zone, start, days)).map(f => [f.date, f.kind, f.instants])).toEqual(expected)
  })

  it('renders the text examples exactly', async () => {
    for (const example of util.examples!) {
      expect(await util.apply(example.input, example.params!)).toBe(example.output)
    }
  })

  it('describes half-hour and whole-day forward shifts', async () => {
    expect(await util.apply('02:15', { timeZone: 'Australia/Lord_Howe', start: '2026-09-01', days: 240 }))
      .toBe('2026-10-04 02:15  missing   clocks go forward 30 minutes at 2026-10-03T15:30:00Z (UTC+10:30 → UTC+11:00)')
    expect(await util.apply('12:00', { timeZone: 'Pacific/Apia', start: '2011-12-28', days: 5 }))
      .toBe('2011-12-30 12:00  missing   clocks go forward 1 day at 2011-12-30T10:00:00Z (UTC-10:00 → UTC+14:00)')
  })

  it('names the times, zone and inclusive range when nothing is affected', async () => {
    expect(await util.apply('02:30', { timeZone: 'Asia/Tokyo', start: '2026-01-01', days: 365 }))
      .toBe('No missing or repeated times for 02:30 in Asia/Tokyo from 2026-01-01 through 2026-12-31 (inclusive).')
    expect(await check('02:30', 'Asia/Tokyo', '2026-01-01', 365)).toEqual([])
  })

  it('filters by the local weekday, including the Saturday before a midnight change', async () => {
    expect(await check('02:30', 'Europe/Belgrade', '2026-10-01', 200, { weekday: 'sunday' })).toHaveLength(2)
    expect(await check('02:30', 'Europe/Belgrade', '2026-10-01', 200, { weekday: 'monday' })).toEqual([])
    expect(await check('23:30', 'America/Santiago', '2026-04-04', 1, { weekday: 'saturday' })).toHaveLength(1)
    expect(await check('23:30', 'America/Santiago', '2026-04-04', 1, { weekday: 'sunday' })).toEqual([])
  })

  it('ignores blank lines and whitespace and sorts multiple times with seconds', async () => {
    const found = await check(' 02:45:12 \r\n\n02:15\r\n02:30:01 ', 'Europe/Belgrade', '2026-10-01', 200)
    expect(found.map(f => `${f.date} ${f.time}`)).toEqual([
      '2026-10-25 02:15', '2026-10-25 02:30:01', '2026-10-25 02:45:12',
      '2027-03-28 02:15', '2027-03-28 02:30:01', '2027-03-28 02:45:12',
    ])
    expect(found[1].instants).toEqual(['2026-10-25T00:30:01Z', '2026-10-25T01:30:01Z'])
    expect(await check(' \n\t', 'Europe/London', '2026-01-01', 1)).toEqual([])
  })

  it.each(['2026-10-25', '2027-03-28'])('includes the first second and excludes the end of the window on %s', async start => {
    const found = await check('01:59:59\n02:00:00\n02:59:59\n03:00:00', 'Europe/Belgrade', start, 1)
    expect(found.map(f => f.time)).toEqual(['02:00:00', '02:59:59'])
  })

  it('includes both ends of a skipped calendar day but neither adjacent date', async () => {
    const found = await check('00:00:00\n23:59:59', 'Pacific/Apia', '2011-12-29', 3)
    expect(found.map(f => [f.date, f.time])).toEqual([
      ['2011-12-30', '00:00:00'], ['2011-12-30', '23:59:59'],
    ])
  })

  it('includes standard-time changes and Ramadan suspensions', async () => {
    expect(await check('02:30', 'Europe/Moscow', '2011-03-27', 1)).toMatchObject([
      { kind: 'missing', transition: { from: 'UTC+03:00', to: 'UTC+04:00' } },
    ])
    expect((await check('02:30', 'Africa/Casablanca', '2026-01-01', 150)).map(f => f.kind))
      .toEqual(['repeated', 'missing'])
  })

  it.each(['24:00', '2:30', '12:60', '12:30:60', '12:30Z', 'garbage'])('names the invalid line for %s', time => {
    expect(() => util.apply(`02:30\n\n ${time} `, {})).toThrow(`Invalid time on line 3: " ${time} "`)
  })

  it('turns an invalid zone into a friendly error', () => {
    expect(() => util.apply('02:30', { timeZone: 'Mars/Olympus' }))
      .toThrow('Invalid time zone "Mars/Olympus": enter an IANA zone such as Europe/London.')
  })

  it.each([0, 401, 1.5])('rejects days %s via declarative param validation', days => {
    expect(validateParam(util.params.days, days)).not.toBeNull()
    expect(() => util.apply('02:30', { start: '2026-01-01', days })).toThrow('days:')
  })

  it.each(['2026-02-30', '2026-01-01T00:00:00Z', '01/01/2026'])('rejects a non-calendar start: %s', start => {
    expect(() => util.apply('02:30', { start })).toThrow('Invalid start date')
  })

  it('defaults to today in the selected zone, even across the UTC date boundary', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-01T00:30:00Z'))
    expect(await util.apply('12:00', { timeZone: 'America/New_York', days: 1 }))
      .toContain('from 2026-10-31 through 2026-10-31')
    expect(await util.apply('12:00', { days: 1 })).toContain('Europe/London from 2026-11-01 through 2026-11-01')
  })

  it('does not multiply Intl calls by the number of input times', async () => {
    const calls = vi.spyOn(Intl.DateTimeFormat.prototype, 'formatToParts')
    await check('02:30', 'Europe/Belgrade', '2026-01-01', 400)
    const single = calls.mock.calls.length
    calls.mockClear()
    const times = Array.from({ length: 100 }, (_, i) => `02:${String(i % 60).padStart(2, '0')}:${String(Math.floor(i / 60)).padStart(2, '0')}`)
    await check(times.join('\n'), 'Europe/Belgrade', '2026-01-01', 400)
    expect(calls.mock.calls.length).toBe(single)
    expect(single).toBeLessThan(1700)
  })

  it('reuses the formatter for a zone', async () => {
    await check('12:00', 'Asia/Tokyo', '2026-01-01', 1)
    const construct = vi.spyOn(Intl, 'DateTimeFormat')
    await check('12:00', 'Asia/Tokyo', '2026-01-01', 1)
    expect(construct).not.toHaveBeenCalled()
  })

  it('agrees with the brute-force reference across random dates, zones and times with seconds', async () => {
    const zones = [
      'Europe/Belgrade', 'America/New_York', 'Australia/Lord_Howe', 'America/Havana',
      'America/Santiago', 'Pacific/Apia', 'Asia/Tokyo', 'Europe/London', 'Australia/Sydney', 'Africa/Casablanca',
    ]
    const first = Date.UTC(2010, 0, 1)
    const last = Date.UTC(2030, 11, 31)
    await fc.assert(fc.asyncProperty(
      fc.constantFrom(...zones),
      fc.integer({ min: 0, max: (last - first) / DAY }),
      fc.integer({ min: 1, max: 60 }),
      fc.integer({ min: 0, max: 23 }),
      fc.integer({ min: 0, max: 59 }),
      fc.integer({ min: 0, max: 59 }),
      async (zone, day, days, h, m, s) => {
        const start = first + day * DAY
        // Also probe early-morning and midnight windows on every random range
        // so this property exercises findings as well as ordinary times.
        const times = [...new Set([h, 0, 1, 2, 23])].sort((a, b) => a - b)
          .map(hour => [hour, m, s].map(n => String(n).padStart(2, '0')).join(':'))
        const expected = []
        for (let i = 0; i < days; i++) {
          const date = iso(start + i * DAY).slice(0, 10)
          for (const time of times) {
            const instants = reference(date, time, zone)
            if (instants.length !== 1) expected.push({
              date, time, kind: instants.length === 0 ? 'missing' : 'repeated', instants: instants.map(iso),
            })
          }
        }
        const actual = await check(times.join('\n'), zone, iso(start).slice(0, 10), days)
        expect(actual.map(({ date, time, kind, instants }) => ({ date, time, kind, instants }))).toEqual(expected)
      },
    ), { numRuns: 150, seed: 20261020 })
  }, 30_000)
})
