import { describe, expect, it } from 'vitest'
import { buildQuery, formatReport, parsePeriod, parseRows } from './report'

const NOW = new Date('2026-11-15T12:30:00Z')

describe('parsePeriod', () => {
  it('defaults to the last 30 days, up to now', () => {
    const p = parsePeriod([], NOW)
    expect(p.to).toEqual(NOW)
    expect(p.from).toEqual(new Date('2026-10-16T12:30:00Z'))
    expect(p.label).toBe('last 30 days')
    expect(parsePeriod(['--', '--days', '1'], NOW).label).toBe('last 1 day')
  })

  it('takes a calendar month in UTC, a running one only so far', () => {
    expect(parsePeriod(['--month', '2026-10'], NOW)).toEqual({
      from: new Date('2026-10-01T00:00:00Z'), to: new Date('2026-11-01T00:00:00Z'), label: '2026-10',
    })
    expect(parsePeriod(['--month', '2026-11'], NOW)).toMatchObject({ to: NOW, label: '2026-11 (so far)' })
  })

  it.each([
    [['--days', '0']], [['--days', '93']], [['--days', '2.5']], [['--days']], [['--month', '2026-13']],
    [['--month', '2027-01']], [['--month', '2026-07']], [['--days', '7', '--month', '2026-10']], [['--weeks', '2']], [['30']],
  ])('refuses %j', args => {
    expect(() => parsePeriod(args, NOW)).toThrow()
  })
})

describe('buildQuery', () => {
  it('counts the dataset by event and ids within the period, weighted by sampling', () => {
    const sql = buildQuery(parsePeriod(['--month', '2026-10'], NOW))
    expect(sql).toContain('SUM(_sample_interval) AS count')
    expect(sql).toContain('FROM sub_events')
    expect(sql).toContain("timestamp >= toDateTime('2026-10-01 00:00:00') AND timestamp < toDateTime('2026-11-01 00:00:00')")
    expect(sql).toMatch(/FORMAT JSON$/)
  })
})

describe('formatReport', () => {
  it('prints a table per event with its total, and says counts are sampled', () => {
    const rows = parseRows({
      data: [
        { event: 'sponsor_click', first: 'acme-2026-10', second: 'util/jwt_decode', count: '12' },
        { event: 'sponsor_click', first: 'acme-2026-10', second: 'presets/decode-saml-request', count: 3 },
        { event: 'preset_open', first: 'decode-kubernetes-secret', second: 'gallery', count: 7 },
      ],
    })
    const text = formatReport(rows, parsePeriod(['--month', '2026-10'], NOW))
    expect(text).toContain('Events, 2026-10: 2026-10-01 to 2026-10-31 (UTC)')
    expect(text).toContain('Sponsor clicks: 15')
    expect(text).toMatch(/acme-2026-10\s+util\/jwt_decode\s+12/)
    expect(text).toContain('Clicks to our tools: 0')
    expect(text).toContain('Presets loaded into the editor: 7')
    expect(text).toMatch(/decode-kubernetes-secret\s+gallery\s+7/)
    expect(text).toContain('sampling')
  })

  it('prints editor runs by pipeline source and size, and utility adds per utility with their sources on one line', () => {
    const rows = parseRows({
      data: [
        { event: 'editor_run', first: 'editor', second: '1', count: 9 },
        { event: 'editor_run', first: 'share', second: '2-3', count: 2 },
        { event: 'editor_open', first: 'editor', second: 'link', count: 30 },
        { event: 'utility_add', first: 'base64_decode', second: 'picker', count: 4 },
        { event: 'utility_add', first: 'json_format', second: 'palette', count: 5 },
        { event: 'utility_add', first: 'base64_decode', second: 'decode_all', count: 3 },
      ],
    })
    const text = formatReport(rows, parsePeriod(['--days', '7'], NOW))
    expect(text).toContain('Page loads that opened the editor: 30')
    expect(text).toMatch(/editor\s+link\s+30/)
    expect(text).toContain('Page loads that ran the editor: 11')
    expect(text).toMatch(/share\s+2-3\s+2/)
    expect(text).toContain('Utilities added to a pipeline: 12')
    expect(text).toMatch(/utility\s+adds\n-+\s+-+\nbase64_decode\s+7\njson_format\s+5/)
    expect(text).toContain('By from: palette 5, picker 4, decode_all 3')
  })

  it('refuses an answer without data', () => {
    expect(() => parseRows({ errors: ['bad'] })).toThrow()
  })
})
