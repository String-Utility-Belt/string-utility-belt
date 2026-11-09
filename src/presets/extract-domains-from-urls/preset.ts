import type { Preset } from '../types'
import { each, laneStep, step } from '../define'

const preset: Preset = {
  slug: 'extract-domains-from-urls',
  name: 'Extract the domain from a list of URLs',
  summary:
    'Paste a column of links and get each one’s hostname on the same line, lowercased and without www., whether or not the link starts with https://, so it pastes back beside its URL.',
  category: 'Data & Spreadsheets',
  primaryQuery: 'extract domain from url list',
  published: '2026-10-08',
  updated: '2026-11-06',
  related: ['remove-tracking-parameters-from-urls', 'bulk-utm-link-builder'],
  steps: [
    each('host-each', { mode: 'lines' }, [
      laneStep('clean', 'replace', { pattern: '^[\\s"\'<(]+|[\\s"\'<>),].*$', replacement: '', regex: true, flags: 'g' },
        { label: 'keep the first URL on the line' }),
      laneStep('add-scheme', 'line_affix', { prefix: 'https://', suffix: '', skipBlank: true, joinWith: '' },
        { label: 'add https:// if missing', condition: { kind: 'regex', pattern: '^[a-z][a-z0-9+.-]*://', flags: 'i', negate: true } }),
      laneStep('parse', 'url_parse', { base: '', decodeParams: true }),
      laneStep('hostname', 'jsonpath', { path: '$.hostname', mode: 'first', indent: 2 }, { label: 'keep hostname' }),
    ],
      'Parses every line as a URL on its own and keeps only the hostname. Quotes, spaces and any further column (after a tab or comma) are cut off first, and a link without https:// gets it, or the parser would read www.example.com/about as a path.',
      { label: 'hostname of every URL', onError: 'empty' }),
    step('strip-www', 'replace', { pattern: '^www\\.', replacement: '', regex: true, flags: 'gm' },
      'Removes a leading www. from each hostname, so www.example.com and example.com count as the same site. Other subdomains such as shop. or blog. are kept.',
      { label: 'drop www.' }),
  ],
  samples: [
    {
      id: 'mixed-links',
      title: 'Links from a spreadsheet column',
      input: 'https://www.example.com/blog/spring-sale?utm_source=newsletter\nhttp://Shop.Example.org:8080/cart\nexample.net/about-us\nwww.example.com/contact\n\n  https://partner@api.example.com/v2/orders \n',
      output: `example.com
shop.example.org
example.net
example.com

api.example.com
`,
    },
    {
      id: 'two-columns',
      title: 'Two columns copied from a sheet',
      input: 'https://www.example.com\tHome\r\n"https://blog.example.org/2026/launch"\tLaunch post\r\nhttp://192.0.2.10:8080/admin\tStaging admin\r\nhttps://[2001:db8::1]/status\tStatus page\r\n',
      output: 'example.com\r\nblog.example.org\r\n192.0.2.10\r\n[2001:db8::1]\r\n',
    },
    {
      id: 'csv-rows',
      title: 'Rows of a CSV file',
      input: 'https://www.example.com/pricing,Pricing,2026-10-01\n"https://docs.example.org/start?ref=nav","Getting started",2026-10-02\nhttps://example.net/blog/2026/10/launch,Launch post,2026-10-03\n',
      output: 'example.com\ndocs.example.org\nexample.net\n',
    },
  ],
}
export default preset
