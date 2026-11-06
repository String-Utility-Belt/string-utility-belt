import type { Preset } from '../types'
import { step } from '../define'

const preset: Preset = {
  slug: 'hex-to-base64',
  name: 'Convert hex to Base64',
  summary:
    'Paste hexadecimal bytes as sha256sum, an openssl fingerprint, a C array or a hex dump print them and get the same bytes as standard Base64, ready for a Digest header, an SRI hash or a JSON field.',
  category: 'Web & APIs',
  primaryQuery: 'hex to base64',
  published: '2026-11-06',
  related: ['base64-to-hex', 'url-decode-base64', 'decode-basic-auth-header'],
  steps: [
    step('clean', 'replace', { pattern: '^(?:[^=]*=|sha\\d+:)|0x|\\\\x|[\\s:,-]', replacement: '', regex: true, flags: 'gi' },
      'Keeps only the hex digits. Hex rarely arrives bare: openssl prints a Fingerprint= label and colons between bytes, a container digest starts with sha256:, a C array has 0x and commas, and a hex dump has spaces and line breaks. The decoder reads none of that.',
      { label: 'keep only the hex digits' }),
    step('bytes', 'hex_decode', {},
      'Reads every pair of hex digits as one byte. It refuses an odd number of digits or a character outside 0-9 and a-f, so a value that was copied short or still carries a label fails here rather than encoding the wrong bytes.',
      { label: 'hex to bytes' }),
    step('b64', 'base64_encode', {},
      'Encodes the bytes as standard Base64 with + and / and = padding, on one line, the alphabet HTTP headers, Subresource Integrity attributes, JSON APIs and Kubernetes Secrets expect.',
      { label: 'bytes to Base64' }),
  ],
  samples: [
    {
      id: 'sha256sum',
      title: 'Digest printed by sha256sum',
      input: 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
      output: 'uU0nuZNNPgilLlLX2n2r+sSE7+N6U4DukIj3rOLvzek=',
    },
    {
      id: 'openssl-fingerprint',
      title: 'Certificate fingerprint from openssl',
      input: 'sha256 Fingerprint=B9:4D:27:B9:93:4D:3E:08:A5:2E:52:D7:DA:7D:AB:FA:C4:84:EF:E3:7A:53:80:EE:90:88:F7:AC:E2:EF:CD:E9',
      output: 'uU0nuZNNPgilLlLX2n2r+sSE7+N6U4DukIj3rOLvzek=',
    },
    {
      id: 'c-array',
      title: 'AES key as a C byte array',
      input: '0x2b, 0x7e, 0x15, 0x16, 0x28, 0xae, 0xd2, 0xa6,\n0xab, 0xf7, 0x15, 0x88, 0x09, 0xcf, 0x4f, 0x3c\n',
      output: 'K34VFiiu0qar9xWICc9PPA==',
    },
    {
      id: 'image-digest',
      title: 'Container image digest',
      input: 'sha256:b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
      output: 'uU0nuZNNPgilLlLX2n2r+sSE7+N6U4DukIj3rOLvzek=',
    },
  ],
}
export default preset
