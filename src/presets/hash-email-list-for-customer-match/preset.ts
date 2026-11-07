import type { Preset } from '../types'
import { each, laneStep, step } from '../define'

const preset: Preset = {
  slug: 'hash-email-list-for-customer-match',
  name: 'Hash an email list for Customer Match',
  summary:
    'Paste a column of customer emails and get one SHA-256 hash per line, normalized the way Google Ads Customer Match expects, with header and blank rows kept so rows still line up.',
  category: 'Writing & Marketing',
  primaryQuery: 'hash emails for customer match',
  published: '2026-10-08',
  updated: '2026-11-06',
  related: ['bulk-utm-link-builder', 'extract-unique-emails-from-text'],
  steps: [
    step('spaces', 'replace', { pattern: '(?:[^\\S\\r\\n]|["\\u200B-\\u200D\\u2060])+', replacement: '', regex: true, flags: 'g' },
      'Deletes spaces, tabs, non-breaking and zero-width spaces, and the double quotes a CSV export wraps cells in, while keeping line breaks. One stray character gives a completely different hash that never matches.',
      { label: 'remove spaces and quotes' }),
    step('lower', 'case', { mode: 'lower' },
      'Lowercases every address. SHA-256 is case-sensitive, and Google and Meta both lowercase before hashing, so Jane.Doe@Example.com must become jane.doe@example.com first.'),
    step('gmail-dots', 'replace', { pattern: '\\.(?=[^@\\s]*@(?:gmail|googlemail)\\.com$)', replacement: '', regex: true, flags: 'gm' },
      'Google asks for dots before the @ to be removed in gmail.com and googlemail.com addresses, since Gmail ignores them. Dots in every other domain are kept, because there they change the mailbox.',
      { label: 'drop Gmail dots' }),
    each('hash-each', { mode: 'lines' }, [
      laneStep('sha256', 'hash', { algo: 'SHA-256' },
        { condition: { kind: 'regex', pattern: '^[^@\\s<>,;]+@[^@\\s<>,;]+$' } }),
    ],
      'Hashes each line that holds one address into 64 lowercase hex characters. A header row or a line with several addresses is left as text so you can spot it; without this step the whole list would collapse into a single hash.',
      { label: 'SHA-256 every address' }),
  ],
  samples: [
    {
      id: 'crm-export',
      title: 'Spreadsheet column with a header',
      input: 'Email\n Jane.Doe@Example.com \nj.smith.84@gmail.com\n\nALEX.RIVERA@GoogleMail.com \nsupport.team@example.org\n',
      output: "email\n86e0b9e56c17cc4d12387e1949b85053fbe73bc3ce5a1188713a9d300cc6133d\n82234fd011a700871151233b13ed254e4d957f86593149137c49c6c926e696ad\n\nd63b7cbbcc312861619bd507dccd1588632340511d5b96a35ec6a22052bdaa39\n884c53e13ea0e5f65527b2d45b1cdb6909d338c096da039fc7233af1a88b8b01\n",
    },
    {
      id: 'quoted-csv',
      title: 'Column copied from a raw CSV file',
      input: '"Email"\r\n"John_Smith@gmail.com"\r\n"Pat.Lee@Example.net"\r\n',
      output: "email\r\n62a14e44f765419d10fea99367361a727c12365e2520f32218d505ed9aa0f62f\r\na5ba6ed096351a317a33801c0cef8042fd9af41d8d39ec9d1be01c03f6a634a6\r\n",
    },
  ],
}
export default preset
