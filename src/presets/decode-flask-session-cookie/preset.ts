import type { Preset } from '../types'
import { step } from '../define'

const extractPayload = [
  '# a pasted header or cURL command: drop everything up to the last "session="',
  's/^.*\\bsession=//s',
  '# drop leading spaces, then everything after the value (; attributes, other cookies)',
  's/^\\s+//',
  's/[;\\s].*$//s',
  '# drop the "." that marks a compressed payload, then ".timestamp.signature"',
  's/^\\.//',
  's/\\..*$//',
].join('\n')

const preset: Preset = {
  slug: 'decode-flask-session-cookie',
  name: 'Decode a Flask session cookie',
  summary:
    'Paste a Flask session cookie, or the Cookie or Set-Cookie header carrying it, and read the session data inside as formatted JSON, compressed or not.',
  category: 'Web & APIs',
  primaryQuery: 'decode flask session cookie',
  published: '2026-10-07',
  updated: '2026-11-06',
  related: ['decode-saml-request', 'unescape-stringified-json'],
  steps: [
    step('extract', 'sed', { script: extractPayload, perLine: false },
      'Keeps only the payload, the first of the three dot-separated parts (payload.timestamp.signature). It also strips a pasted header or cURL command around the value and the leading dot that marks a compressed payload.'),
    step('decode', 'base64url_decode', { output: 'bytes' },
      'The payload is URL-safe Base64 without padding. Decoded to bytes it is either plain JSON or, for a compressed cookie, a zlib stream starting with the byte 0x78.'),
    step('inflate', 'deflate_decompress', { format: 'zlib', output: 'text' },
      'Inflates the zlib stream to JSON text, checking its Adler-32 checksum. It runs only when the bytes start with x (0x78): itsdangerous compresses a payload only when that saves space, so small sessions skip it.',
      { condition: { kind: 'regex', pattern: '^x' } }),
    step('pretty', 'json_pretty', { indent: 2 },
      'By default Flask writes compact JSON with sorted keys and non-ASCII characters escaped. Indenting it makes nested values such as the _flashes list readable, and parsing turns the escapes back into characters.'),
  ],
  samples: [
    {
      id: 'devtools-value',
      title: 'Value copied from DevTools',
      input: '.eJwljkFqwzAQRa9itA5Bo5E0sle9Q5clmJFm1JgmTrFsKITcvSpdfd5bfN7TzPXG7arNTB9PM-x9TDtK0dbMybwvn6vKsKwDt0F45Tf94fv3Tc_lcT-by-ty6gebtquZ9u3QTouYyaAyiTLGjIHVYqwZkAsShrGyy4nAs1IWl3wQj9Rd5Y7WMqCDEqJ3yByqpAxioY6kkiqNSok1j159sp45wehqrqLKbKMkBxYhhJ4-H023_xrvOpe21Xl_fOnaTXEkjtl5KsKMlrLV-JdZIJIFoBqSKFTz-gWuhVZp.asO0aA.G4caMg6Tn-OJsYeepRRIhRmoaW8',
      output: '{\n  "_flashes": [\n    {\n      " t": [\n        "success",\n        "Signed in as dana@example.com."\n      ]\n    }\n  ],\n  "_fresh": true,\n  "_id": "3ea7dea36b35ae036fb13ac37359fa2b8714ae7bd2845d437a2bfabd200a1321c56423aa5fd8b1d01f97ed8f79e78aeb94e4804aa8192fbfdeeaa06d82103155",\n  "_user_id": "42",\n  "csrf_token": "c27d2aa247cdaa307b0e6036fc1670117f58de1f"\n}',
    },
    {
      id: 'response-headers',
      title: 'Response headers (curl -i)',
      input: 'HTTP/1.1 302 FOUND\r\nServer: Werkzeug/3.1.9 Python/3.13.16\r\nDate: Wed, 07 Oct 2026 20:43:50 GMT\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: 207\r\nLocation: /dashboard\r\nVary: Cookie\r\nSet-Cookie: session=.eJwljktuwzAMRK_icu0FJepj-wi9QBdtEFAUiRhxbMCONw1y9wroajDzMMB7wdUWPm56wPT9gu7ZAubVNujha16W-_Z46Nr9nvvPiWgi97773FY-PuDyvvTtvetxg-m5n9raXGECSikk5jhYcRlDQRmdJao-slcma9QRDSkEassQGkPywY-K6h1LJfQ0Cg45ChYlCRlrjkwqUrG40UYpHIhq8bEaEUtWs-qMU45Zm_r1PHT_t8nw_gNZtEO3.asavBg.jYj9XZAPW5c8GK--dVHirwbO4ko; HttpOnly; Path=/\r\nConnection: close\r\n\r\n',
      output: '{\n  "_flashes": [\n    {\n      " t": [\n        "info",\n        "Willkommen zurück, Jonas!"\n      ]\n    }\n  ],\n  "_fresh": true,\n  "_id": "36646aa58fb1704b0c91f63d25a2ea3f646133864435a284f63032429e0e21acd30239c0875c0be3c470d75a3eccd0b19f9cba433db25df33ac7effd1fa6757e",\n  "_user_id": "7"\n}',
    },
    {
      id: 'uncompressed-cookie-header',
      title: 'Uncompressed, in a Cookie header',
      input: 'Cookie: theme=dark; session=eyJjYXJ0IjpbMywxN10sImxhbmciOiJkZSJ9.asO0aA.l941NzyfbG_kKTRnX7SiKleQU6I; tz=Europe%2FBerlin',
      output: '{\n  "cart": [\n    3,\n    17\n  ],\n  "lang": "de"\n}',
    },
    {
      id: 'copy-as-curl',
      title: 'Permanent session, copied as cURL',
      input: "curl 'http://localhost:5000/settings' \\\n  -H 'accept: text/html,application/xhtml+xml' \\\n  -b 'theme=dark; session=.eJwdzsFqwzAQBNBfEXsWRRaxLQtyaiGFNuTQQg8liJW1tpPaoljrpDT436v0tJd5M3sD142YBkpgP28gOB-YKCXsCSS8EfMp9kkkvFB4gON6lOC-aZ4wUsxhnheS0OLM7hTA5oYFLKjOdBhKH5rWb6qmw6Iqa2WqutamKRXBKiGvsktE8V9lCx8UpFC1OLQstNKVUI0ttN0UYrd_v5MreVx4iK4dcBwp5hfv1md7ftT49GV8MIex5Nfr9Pvz8txvt7Cuf-m8RmY.asavBg.6Gxt8-Eq5vEqppePKxjkaJw85Is' \\\n  -H 'user-agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'",
      output: '{\n  "_flashes": [\n    {\n      " t": [\n        "message",\n        "Settings saved."\n      ]\n    }\n  ],\n  "_permanent": true,\n  "cart_id": {\n    " u": "0f8fad5bd9cb469fa16570867728950e"\n  },\n  "last_seen": {\n    " d": "Wed, 07 Oct 2026 09:12:41 GMT"\n  },\n  "webauthn_challenge": {\n    " b": "jC2aDk8bd8Ol5tLwmzxKHg=="\n  }\n}',
    },
  ],
}
export default preset
