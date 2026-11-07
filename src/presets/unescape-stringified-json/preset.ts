import type { Preset } from '../types'
import { step } from '../define'

/**
 * Run an unescape step only while the text still looks escaped: it starts with a
 * double or single quote (escaped or not), or a backslash follows its opening
 * bracket(s), as in {\"id or {\n  \"id. A valid JSON object or array never has a
 * backslash there, so it is left alone.
 */
const stillEscaped = { kind: 'regex' as const, pattern: String.raw`^(\\*["']|[\[{][\s\[{]*\\)` }

const preset: Preset = {
  slug: 'unescape-stringified-json',
  name: 'Unescape stringified JSON and pretty-print it',
  summary:
    'Paste JSON full of backslashes, quoted or not, stringified once or twice, and get indented JSON back. Text that is already valid JSON is only pretty-printed.',
  category: 'Frontend',
  primaryQuery: 'decode stringified json',
  published: '2026-10-07',
  updated: '2026-11-06',
  related: ['nested-json-to-csv', 'decode-cloudwatch-logs-data'],
  steps: [
    step('trim', 'trim', {},
      'Drops the newline or spaces that come along when you copy a value from a terminal or log viewer. The next step strips the outer quotes only when they are the very first and last characters.'),
    step('unescape-1', 'code_string_unescape', { language: 'json' },
      'Peels off one layer: strips the outer quotes if there are any and decodes the escapes under strict JSON rules. The condition skips it unless the text starts with a quote (double or single, escaped or not) or a backslash follows its opening { or [.',
      { condition: stillEscaped, label: 'unescape one layer' }),
    step('unescape-2', 'code_string_unescape', { language: 'json' },
      'A value stringified twice, like this one, is still a quoted string after the first pass. The same condition skips this step for JSON that is already clean, whose escaped quotes inside values must stay escaped.',
      { condition: stillEscaped, label: 'unescape a second layer' }),
    step('pretty', 'json_pretty', { indent: 2 },
      "Parses the result, so text that is still not JSON fails here with the parser's message, and prints it with two-space indentation. Parsing also turns escapes left inside values, such as \\u2014, into the characters they stand for."),
  ],
  samples: [
    {
      id: 'stringified-twice',
      title: 'Stringified twice',
      input: "\"\\\"{\\\\\\\"orderId\\\\\\\":\\\\\\\"ord_8f2k1\\\\\\\",\\\\\\\"status\\\\\\\":\\\\\\\"paid\\\\\\\",\\\\\\\"total\\\\\\\":52.48,\\\\\\\"items\\\\\\\":[{\\\\\\\"sku\\\\\\\":\\\\\\\"TSHIRT-M\\\\\\\",\\\\\\\"qty\\\\\\\":2,\\\\\\\"price\\\\\\\":19.99},{\\\\\\\"sku\\\\\\\":\\\\\\\"MUG-01\\\\\\\",\\\\\\\"qty\\\\\\\":1,\\\\\\\"price\\\\\\\":12.5}],\\\\\\\"note\\\\\\\":\\\\\\\"Leave at the door \\\\\\\\u2014 thanks!\\\\\\\"}\\\"\"\n",
      output: "{\n  \"orderId\": \"ord_8f2k1\",\n  \"status\": \"paid\",\n  \"total\": 52.48,\n  \"items\": [\n    {\n      \"sku\": \"TSHIRT-M\",\n      \"qty\": 2,\n      \"price\": 19.99\n    },\n    {\n      \"sku\": \"MUG-01\",\n      \"qty\": 1,\n      \"price\": 12.5\n    }\n  ],\n  \"note\": \"Leave at the door — thanks!\"\n}",
    },
    {
      id: 'docker-log-field',
      title: 'Docker log field, no quotes',
      input: "{\\\"level\\\":\\\"warn\\\",\\\"time\\\":\\\"2026-10-06T14:03:11.482Z\\\",\\\"msg\\\":\\\"upstream timeout calling \\\\\\\"POST /v1/charges\\\\\\\"\\\",\\\"orderId\\\":\\\"ord_8f2k1\\\",\\\"attempt\\\":2,\\\"clientIp\\\":\\\"203.0.113.24\\\"}\\n",
      output: "{\n  \"level\": \"warn\",\n  \"time\": \"2026-10-06T14:03:11.482Z\",\n  \"msg\": \"upstream timeout calling \\\"POST /v1/charges\\\"\",\n  \"orderId\": \"ord_8f2k1\",\n  \"attempt\": 2,\n  \"clientIp\": \"203.0.113.24\"\n}",
    },
    {
      id: 'lambda-event-body',
      title: 'Pretty-printed Lambda event body',
      input: "{\\n  \\\"email\\\": \\\"ada@example.com\\\",\\n  \\\"plan\\\": \\\"team\\\",\\n  \\\"seats\\\": 5,\\n  \\\"addons\\\": [\\n    \\\"sso\\\",\\n    \\\"audit-log\\\"\\n  ]\\n}",
      output: "{\n  \"email\": \"ada@example.com\",\n  \"plan\": \"team\",\n  \"seats\": 5,\n  \"addons\": [\n    \"sso\",\n    \"audit-log\"\n  ]\n}",
    },
    {
      id: 'already-valid',
      title: 'Already valid JSON',
      input: "{\"error\":\"Unexpected token '<', \\\"<!DOCTYPE \\\"... is not valid JSON\",\"status\":502,\"url\":\"https://api.example.com/v1/orders\"}",
      output: "{\n  \"error\": \"Unexpected token '<', \\\"<!DOCTYPE \\\"... is not valid JSON\",\n  \"status\": 502,\n  \"url\": \"https://api.example.com/v1/orders\"\n}",
    },
  ],
}
export default preset
