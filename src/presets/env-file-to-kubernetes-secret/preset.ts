import type { Preset } from '../types'
import { each, laneStep, step } from '../define'

const preset: Preset = {
  slug: 'env-file-to-kubernetes-secret',
  name: 'Turn a .env file into a Kubernetes Secret',
  summary:
    'Paste a .env file and get a Secret manifest with every value Base64-encoded under data, ready for kubectl apply, with quotes, export prefixes, comments and multi-line values handled.',
  category: 'DevOps & Config',
  primaryQuery: 'kubernetes secret from env file',
  published: '2026-10-08',
  updated: '2026-11-06',
  related: ['decode-kubernetes-secret', 'spring-boot-yaml-to-env-vars'],
  steps: [
    step('parse', 'env_to_json', { typed: false, expand: false, indent: 2 },
      'Parses the file: comments, blank lines and export prefixes are dropped, quotes come off and a quoted value can span lines. An unquoted value ends where a # follows a space, as in python-dotenv and Docker Compose. A malformed line stops the preset here rather than producing a broken Secret.',
      { label: 'parse the .env file', onError: 'stop' }),
    each('encode-values', { mode: 'json-values' }, [laneStep('b64', 'base64_encode')],
      'Base64-encodes every value on its own and keeps it under its variable name, because a Secret stores each data entry encoded separately. Encoded values also cannot be misread as YAML booleans, the way kubectl reads a plain on, yes or no.',
      { label: 'encode every value' }),
    step('wrap', 'replace', {
      pattern: '^([\\s\\S]*)$',
      replacement: '{"apiVersion":"v1","kind":"Secret","metadata":{"name":"app-env"},"type":"Opaque","data":$1}',
      regex: true,
      flags: '',
    },
      'Puts the encoded map under data in a v1 Secret of type Opaque named app-env. Change the name here, or in the finished YAML, to the one your Deployment references.',
      { label: 'wrap in a Secret' }),
    step('yaml', 'json_to_yaml', { indent: 2, lineWidth: 80, sortKeys: false },
      'Writes the manifest as YAML for kubectl apply -f or a GitOps repository. Keys keep the order of the .env file, and long encoded values stay on one line.'),
  ],
  samples: [
    {
      id: 'app-env',
      title: 'App .env with quotes and comments',
      input: `# payments-api, production
export NODE_ENV=production
PORT=8080
DATABASE_URL="postgres://payments:p%40ss-2026@db.example.com:5432/payments?sslmode=require"
REDIS_URL=redis://cache.example.com:6379/0  # session store
SESSION_SECRET='k9$Lm#2vQ!x7-not-a-real-secret'
ENABLE_SIGNUPS=on
MAINTENANCE_MODE=no
`,
      output: `apiVersion: v1
kind: Secret
metadata:
  name: app-env
type: Opaque
data:
  NODE_ENV: cHJvZHVjdGlvbg==
  PORT: ODA4MA==
  DATABASE_URL: cG9zdGdyZXM6Ly9wYXltZW50czpwJTQwc3MtMjAyNkBkYi5leGFtcGxlLmNvbTo1NDMyL3BheW1lbnRzP3NzbG1vZGU9cmVxdWlyZQ==
  REDIS_URL: cmVkaXM6Ly9jYWNoZS5leGFtcGxlLmNvbTo2Mzc5LzA=
  SESSION_SECRET: azkkTG0jMnZRIXg3LW5vdC1hLXJlYWwtc2VjcmV0
  ENABLE_SIGNUPS: b24=
  MAINTENANCE_MODE: bm8=
`,
    },
    {
      id: 'multiline-cert',
      title: 'Multi-line certificate and empty value',
      input: `# internal services trust this CA
CA_CERT="-----BEGIN CERTIFICATE-----
MIIBKjCB3aADAgECAgIgJjAFBgMrZXAwNDEcMBoGA1UEAwwTRXhhbXBsZSBJbnRl
cm5hbCBDQTEUMBIGA1UECgwLRXhhbXBsZSBPcmcwHhcNMjYwMTAxMDAwMDAwWhcN
MzYwMTAxMDAwMDAwWjA0MRwwGgYDVQQDDBNFeGFtcGxlIEludGVybmFsIENBMRQw
EgYDVQQKDAtFeGFtcGxlIE9yZzAqMAUGAytlcAMhAAOhB7/zzhC+HXDdGOdLwJln
5NYwm6UNXx3chmQSVTG4oxMwETAPBgNVHRMBAf8EBTADAQH/MAUGAytlcANBANcT
bXDvEJHs87LUbmNnvVIVfR+KPug9ppwhd2FW1C57UK4e3OmANrUxUuAPCjFKQnDA
iHXMCAnWQypzTbkMnAw=
-----END CERTIFICATE-----"
SMTP_HOST=smtp.example.org
SMTP_FROM="Example Alerts <alerts@example.org>"
WELCOME_TEXT="Hello,\\nyour account is ready."
SENTRY_DSN=
`,
      output: `apiVersion: v1
kind: Secret
metadata:
  name: app-env
type: Opaque
data:
  CA_CERT: LS0tLS1CRUdJTiBDRVJUSUZJQ0FURS0tLS0tCk1JSUJLakNCM2FBREFnRUNBZ0lnSmpBRkJnTXJaWEF3TkRFY01Cb0dBMVVFQXd3VFJYaGhiWEJzWlNCSmJuUmwKY201aGJDQkRRVEVVTUJJR0ExVUVDZ3dMUlhoaGJYQnNaU0JQY21jd0hoY05Nall3TVRBeE1EQXdNREF3V2hjTgpNell3TVRBeE1EQXdNREF3V2pBME1Sd3dHZ1lEVlFRRERCTkZlR0Z0Y0d4bElFbHVkR1Z5Ym1Gc0lFTkJNUlF3CkVnWURWUVFLREF0RmVHRnRjR3hsSUU5eVp6QXFNQVVHQXl0bGNBTWhBQU9oQjcvenpoQytIWERkR09kTHdKbG4KNU5Zd202VU5YeDNjaG1RU1ZURzRveE13RVRBUEJnTlZIUk1CQWY4RUJUQURBUUgvTUFVR0F5dGxjQU5CQU5jVApiWER2RUpIczg3TFVibU5udlZJVmZSK0tQdWc5cHB3aGQyRlcxQzU3VUs0ZTNPbUFOclV4VXVBUENqRktRbkRBCmlIWE1DQW5XUXlwelRia01uQXc9Ci0tLS0tRU5EIENFUlRJRklDQVRFLS0tLS0=
  SMTP_HOST: c210cC5leGFtcGxlLm9yZw==
  SMTP_FROM: RXhhbXBsZSBBbGVydHMgPGFsZXJ0c0BleGFtcGxlLm9yZz4=
  WELCOME_TEXT: SGVsbG8sCnlvdXIgYWNjb3VudCBpcyByZWFkeS4=
  SENTRY_DSN: ""
`,
    },
  ],
}
export default preset
