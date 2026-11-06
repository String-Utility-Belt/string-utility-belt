import type { Preset } from '../types'
import { step } from '../define'

const preset: Preset = {
  slug: 'yaml-to-env',
  name: 'Convert YAML to a .env file',
  summary:
    'Paste a YAML config and get one KEY=value line per setting: nested keys joined with underscores, list items numbered, names upper-cased, values quoted only when needed, ready for Docker Compose, dotenv or CI.',
  category: 'DevOps & Config',
  primaryQuery: 'yaml to env converter',
  published: '2026-11-06',
  related: ['spring-boot-yaml-to-env-vars', 'env-file-to-kubernetes-secret', 'decode-kubernetes-secret'],
  steps: [
    step('parse', 'yaml_to_json', { indent: 2, allDocuments: false },
      'Parses the YAML into a JSON object so the key paths can be walked. Anchors and aliases are resolved, comments dropped, and quoted and unquoted scalars read the way YAML defines them, so "8080" and 8080 arrive as the string and the number they are.',
      { label: 'parse the YAML' }),
    step('env', 'json_to_env', { upperCase: true, delimiter: '_', quote: 'auto', exportPrefix: false },
      'Flattens the object into KEY=value lines: each level of nesting adds an underscore, list items get their index, characters a variable name cannot hold become underscores, and names are upper-cased. A value with spaces, quotes, # or $ is quoted so a dotenv parser reads it whole.',
      { label: 'write KEY=value lines' }),
  ],
  samples: [
    {
      id: 'app-config',
      title: 'Service config with nested keys and a list',
      input: 'app:\n  name: order-service\n  port: 8080\ndatabase:\n  host: db.example.net\n  port: 5432\n  user: orders_app\n  password: ${DB_PASSWORD}\n  pool:\n    max: 20\nredis:\n  url: redis://cache.example.net:6379/0\nfeatures:\n  dark_mode: true\n  beta_checkout: false\ncors_origins:\n  - https://shop.example.com\n  - https://admin.example.com\n',
      output: "APP_NAME=order-service\nAPP_PORT=8080\nDATABASE_HOST=db.example.net\nDATABASE_PORT=5432\nDATABASE_USER=orders_app\nDATABASE_PASSWORD='${DB_PASSWORD}'\nDATABASE_POOL_MAX=20\nREDIS_URL=redis://cache.example.net:6379/0\nFEATURES_DARK_MODE=true\nFEATURES_BETA_CHECKOUT=false\nCORS_ORIGINS_0=https://shop.example.com\nCORS_ORIGINS_1=https://admin.example.com",
    },
    {
      id: 'values-needing-quotes',
      title: 'Values with spaces, # and %',
      input: 'smtp:\n  host: smtp.example.net\n  from: "Orders <orders@example.com>"\n  subject_prefix: "[Shop] "\nschedule:\n  report_cron: "0 30 6 * * 1-5"\nnotes: "Launch #3 (EU)"\nlog_pattern: "%d{HH:mm:ss} %-5level - %msg%n"\n',
      output: 'SMTP_HOST=smtp.example.net\nSMTP_FROM="Orders <orders@example.com>"\nSMTP_SUBJECT_PREFIX="[Shop] "\nSCHEDULE_REPORT_CRON="0 30 6 * * 1-5"\nNOTES="Launch #3 (EU)"\nLOG_PATTERN="%d{HH:mm:ss} %-5level - %msg%n"',
    },
    {
      id: 'odd-key-names',
      title: 'Keys with dashes, dots and spaces',
      input: "log-level: debug\nserver.port: 9090\ncache ttl: 300\nowner: \"Dana O'Neil\"\n",
      output: 'LOG_LEVEL=debug\nSERVER_PORT=9090\nCACHE_TTL=300\nOWNER="Dana O\'Neil"',
    },
  ],
}
export default preset
