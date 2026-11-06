import type { Preset } from '../types'
import { each, laneStep, step } from '../define'

/** Well-formed standard Base64: a length that is not one more than a multiple of four, optional padding. */
const BASE64_LINE = '^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}(?:==)?|[A-Za-z0-9+/]{3}=?)?$'

const preset: Preset = {
  slug: 'bulk-base64-decode',
  name: 'Decode a list of Base64 values line by line',
  summary:
    'Paste a column of Base64 values, a JSON array of them or a quoted CSV column and get every value decoded on its own line, with headers, blank lines and Windows line endings kept so the rows still line up.',
  category: 'Data & Spreadsheets',
  primaryQuery: 'decode a list of base64 values',
  published: '2026-11-06',
  related: ['bulk-md5-hash', 'base64-to-json', 'decode-kubernetes-secret'],
  steps: [
    step('strip', 'replace', { pattern: '^[^\\S\\r\\n]*["\']?|["\']?,?[^\\S\\r\\n]*$', replacement: '', regex: true, flags: 'gm' },
      'Removes what wraps a value in a JSON array or a CSV export: the indentation, the quotes and the comma after it. None of that is Base64, and a decoder that meets a quote rejects the whole line. Line breaks stay where they are, so every value keeps its row.',
      { label: 'strip quotes and padding' }),
    each('decode', { mode: 'lines' }, [
      laneStep('b64', 'base64_decode', {}, { condition: { kind: 'regex', pattern: BASE64_LINE } }),
    ],
    'Decodes each line on its own and writes the text back on the same row, so one list in gives one list out. Only lines shaped like Base64 are decoded: a header, a bracket or a note stays as written instead of stopping the run.',
    { label: 'decode each line' }),
  ],
  samples: [
    {
      id: 'quoted-csv',
      title: 'Quoted CSV column saved on Windows',
      input: '"Base64 value"\r\n"aGVsbG8gd29ybGQ="\r\n"ZGFuYUBleGFtcGxlLmNvbQ=="\r\n',
      output: 'Base64 value\r\nhello world\r\ndana@example.com\r\n',
    },
    {
      id: 'spreadsheet-column',
      title: 'Column copied from a spreadsheet',
      input: 'Value\naGVsbG8gd29ybGQ=\nY29ycmVjdCBob3JzZSBiYXR0ZXJ5IHN0YXBsZQ==\n\nZGFuYUBleGFtcGxlLmNvbQ==\n',
      output: 'Value\nhello world\ncorrect horse battery staple\n\ndana@example.com\n',
    },
    {
      id: 'json-array',
      title: 'JSON array of tokens',
      input: '[\n  "YWxpY2U6Y29ycmVjdCBob3JzZSBiYXR0ZXJ5IHN0YXBsZQ==",\n  "YXBpX3VzZXI6UzNjcjN0LVRva2VuLTIwMjY=",\n  "c3ZjLWRlcGxveTpwQHNzOncwcmQh"\n]',
      output: '[\nalice:correct horse battery staple\napi_user:S3cr3t-Token-2026\nsvc-deploy:p@ss:w0rd!\n]',
    },
  ],
}
export default preset
