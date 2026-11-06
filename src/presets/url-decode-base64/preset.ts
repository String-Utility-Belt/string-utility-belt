import type { Preset } from '../types'
import { step } from '../define'

const preset: Preset = {
  slug: 'url-decode-base64',
  name: 'Decode a URL-encoded Base64 value',
  summary:
    'Paste a Base64 value copied out of a URL, with its = written as %3D and its + and / as %2B and %2F, and read the text inside: the percent-encoding is undone first, then the Base64.',
  category: 'Web & APIs',
  primaryQuery: 'decode base64 from a url parameter',
  published: '2026-11-06',
  related: ['url-decode-json', 'base64-to-json', 'decode-basic-auth-header'],
  steps: [
    step('percent', 'url_decode', {},
      'Turns %3D, %2B and %2F back into =, + and /. A Base64 value placed in a query string is percent-encoded first, and a Base64 decoder given the encoded form either fails on the % signs or reads the wrong characters.',
      { label: 'undo the percent-encoding' }),
    step('b64', 'base64_decode', {},
      'Decodes the restored Base64 into UTF-8 text: the JSON state, token or path the parameter carried. Binary payloads fail here on purpose rather than coming out as replacement characters.',
      { label: 'decode the Base64' }),
  ],
  samples: [
    {
      id: 'state-parameter',
      title: 'state= parameter from a callback URL',
      input: 'eyJyZXR1cm5UbyI6Ii9jaGVja291dC9yZXZpZXc%2Fc3RlcD0zIiwicmVmIjoiZW1haWx%2Bbm92In0%3D',
      output: '{"returnTo":"/checkout/review?step=3","ref":"email~nov"}',
    },
    {
      id: 'padded-token',
      title: 'Token whose padding was encoded',
      input: 'YXBpX3VzZXI6UzNjcjN0LVRva2VuLTIwMjY%3D',
      output: 'api_user:S3cr3t-Token-2026',
    },
    {
      id: 'already-decoded',
      title: 'Value that was not percent-encoded',
      input: 'cmV0dXJuX3RvPS9hY2NvdW50L29yZGVycz9wYWdlPTImcmVmPX5tYWls',
      output: 'return_to=/account/orders?page=2&ref=~mail',
    },
  ],
}
export default preset
