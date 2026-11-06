import type { Preset } from '../types'
import { step } from '../define'

const preset: Preset = {
  slug: 'base64-to-hex',
  name: 'Convert Base64 to hex',
  summary:
    'Paste a Base64 value and get the same bytes as lowercase hexadecimal: a hash from a Digest header, a key from a config file or plain text, whether or not the bytes are valid UTF-8.',
  category: 'Web & APIs',
  primaryQuery: 'base64 to hex',
  published: '2026-11-06',
  related: ['hex-to-base64', 'base64-to-json', 'url-decode-base64'],
  steps: [
    step('bytes', 'get_bytes', { mode: 'base64' },
      'Turns the Base64 text back into the bytes it stands for without reading them as text. A plain base64 decode step insists on UTF-8 and rejects a hash, a key or an IV, which is what most Base64-to-hex jobs start from. Line breaks inside a wrapped value are ignored.',
      { label: 'Base64 to bytes' }),
    step('hex', 'hex_encode', {},
      'Writes every byte as two lowercase hexadecimal digits with nothing between them, the form sha256sum, openssl dgst and most APIs print, so the result compares directly with theirs or pastes straight into a config file.',
      { label: 'bytes to hex' }),
  ],
  samples: [
    {
      id: 'sha256-digest',
      title: 'SHA-256 digest from a Digest header',
      input: 'uU0nuZNNPgilLlLX2n2r+sSE7+N6U4DukIj3rOLvzek=',
      output: 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
    },
    {
      id: 'aes-key',
      title: 'AES-128 key from a config file',
      input: 'K34VFiiu0qar9xWICc9PPA==',
      output: '2b7e151628aed2a6abf7158809cf4f3c',
    },
    {
      id: 'wrapped-digest',
      title: 'SHA-512 digest wrapped by openssl',
      input: 'MJ7MSJwS1utMxA9QyQLytNDtd+5RGnx6m808qG1M2G+YndNbxf9JlnDaNCVbRbDP\n2DDoH2Bdz33FVC6TrpzXbw==\n',
      output: '309ecc489c12d6eb4cc40f50c902f2b4d0ed77ee511a7c7a9bcd3ca86d4cd86f989dd35bc5ff499670da34255b45b0cfd830e81f605dcf7dc5542e93ae9cd76f',
    },
    {
      id: 'plain-text',
      title: 'Plain text',
      input: 'aGVsbG8gd29ybGQ=',
      output: '68656c6c6f20776f726c64',
    },
  ],
}
export default preset
