import type { Preset } from '../types'
import { step } from '../define'

const preset: Preset = {
  slug: 'url-decode-json',
  name: 'Decode URL-encoded JSON and format it',
  summary:
    'Paste a JSON value as it appears in a query string or a cookie, all %7B, %22 and %2C, and read it as indented JSON: the percent-encoding is undone, then the document is parsed and pretty-printed.',
  category: 'Web & APIs',
  primaryQuery: 'decode json from a url parameter',
  published: '2026-11-06',
  related: ['url-decode-base64', 'base64-to-json', 'unescape-stringified-json'],
  steps: [
    step('percent', 'url_decode', {},
      'Replaces every %XX escape with the character it stands for, so %7B%22status%22 becomes {"status". Braces, quotes, commas and colons are all escaped in a URL, which is why the raw parameter is unreadable.',
      { label: 'undo the percent-encoding' }),
    step('pretty', 'json_pretty', { indent: 2 },
      'Parses the decoded text as JSON and prints it with two-space indentation. A parse error here means the parameter was truncated or encoded twice, which is worth knowing before debugging the application that sent it.',
      { label: 'format the JSON' }),
  ],
  samples: [
    {
      id: 'filter-parameter',
      title: 'filter= parameter from an API URL',
      input: '%7B%22status%22%3A%22open%22%2C%22assignee%22%3A%22dana%40example.com%22%2C%22tags%22%3A%5B%22billing%22%2C%22urgent%22%5D%7D',
      output: '{\n  "status": "open",\n  "assignee": "dana@example.com",\n  "tags": [\n    "billing",\n    "urgent"\n  ]\n}',
    },
    {
      id: 'consent-cookie',
      title: 'Cookie value holding JSON',
      input: '%7B%22consent%22%3A%7B%22analytics%22%3Afalse%2C%22ads%22%3Afalse%7D%2C%22version%22%3A3%2C%22updated%22%3A%222026-11-06%22%7D',
      output: '{\n  "consent": {\n    "analytics": false,\n    "ads": false\n  },\n  "version": 3,\n  "updated": "2026-11-06"\n}',
    },
    {
      id: 'state-parameter',
      title: 'state= parameter with a path inside',
      input: '%7B%22returnTo%22%3A%22%2Fdashboard%3Ftab%3Dusage%22%2C%22nonce%22%3A%22b7f3e9%22%2C%22ts%22%3A1794399737%7D',
      output: '{\n  "returnTo": "/dashboard?tab=usage",\n  "nonce": "b7f3e9",\n  "ts": 1794399737\n}',
    },
  ],
}
export default preset
