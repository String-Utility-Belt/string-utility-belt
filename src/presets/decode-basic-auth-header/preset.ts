import type { Preset } from '../types'
import { step } from '../define'

const preset: Preset = {
  slug: 'decode-basic-auth-header',
  name: 'Decode a Basic auth header',
  summary:
    'Paste an Authorization: Basic header, the curl command or log line that carries it, or the bare token, and read the user name and password it encodes, split at the first colon as RFC 7617 defines.',
  category: 'Web & APIs',
  primaryQuery: 'basic auth decoder',
  published: '2026-11-06',
  related: ['url-decode-base64', 'base64-to-json', 'decode-jwts-in-log-file'],
  steps: [
    step('token', 'replace', { pattern: '^[\\s\\S]*?\\bBasic\\s+([A-Za-z0-9+/]+=*)[\\s\\S]*$', replacement: '$1', regex: true, flags: 'i' },
      'Keeps only the Base64 token: the run of Base64 characters after the word Basic, wherever it sits in a header, a curl -H argument, a captured request or a log line. Input that has no Basic prefix is taken to be the token itself and passes through unchanged.',
      { label: 'keep only the token' }),
    step('b64', 'base64_decode', {},
      'Decodes the token into the user-id:password text the client sent. Basic authentication is encoding, not encryption, so this is all it takes; anyone who can read the header can read the credentials.',
      { label: 'decode the token' }),
    step('split', 'replace', { pattern: '^([^:]*):([\\s\\S]*)$', replacement: 'username: $1\npassword: $2', regex: true, flags: '' },
      'Writes the two parts on their own labelled lines, split at the first colon. RFC 7617 forbids a colon in the user-id but allows any number in the password, so splitting at the last colon would mangle a password like p@ss:w0rd.',
      { label: 'name the two parts' }),
  ],
  samples: [
    {
      id: 'header-line',
      title: 'Authorization header',
      input: 'Authorization: Basic YWxpY2U6Y29ycmVjdCBob3JzZSBiYXR0ZXJ5IHN0YXBsZQ==',
      output: 'username: alice\npassword: correct horse battery staple',
    },
    {
      id: 'curl-command',
      title: 'curl command with -H',
      input: "curl -H 'Authorization: Basic YXBpX3VzZXI6UzNjcjN0LVRva2VuLTIwMjY=' https://api.example.com/v2/orders",
      output: 'username: api_user\npassword: S3cr3t-Token-2026',
    },
    {
      id: 'proxy-colon-password',
      title: 'Proxy-Authorization, password with a colon',
      input: 'Proxy-Authorization: Basic c3ZjLWRlcGxveTpwQHNzOncwcmQh',
      output: 'username: svc-deploy\npassword: p@ss:w0rd!',
    },
    {
      id: 'bare-token',
      title: 'Just the token',
      input: 'YWxpY2U6Y29ycmVjdCBob3JzZSBiYXR0ZXJ5IHN0YXBsZQ==',
      output: 'username: alice\npassword: correct horse battery staple',
    },
  ],
}
export default preset
