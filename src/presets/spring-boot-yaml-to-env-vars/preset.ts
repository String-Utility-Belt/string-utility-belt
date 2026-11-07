import type { Preset } from '../types'
import { branch, laneStep, step } from '../define'

/** Step 3: Spring's rule removes dashes; json to .env would turn them into underscores. */
const DASHES = [
  '# delete every dash inside a JSON key: "ddl-auto": becomes "ddlauto":',
  '# (values keep theirs: only a quoted string followed by a colon is a key)',
  String.raw`s/(?<=^\s*"[^"]*)-(?=[^"]*":)//g`,
].join('\n')

/** Kubernetes lane: each KEY=value line becomes a name/value pair under env:. */
const K8S = [
  '# KEY=value -> one entry of a container env: list',
  String.raw`s/^([^=]+)=(.*)$/  - name: \1\n    value: \2/`,
  '# the list heading, before the first entry',
  String.raw`1s/^/env:\n/`,
].join('\n')

const preset: Preset = {
  slug: 'spring-boot-yaml-to-env-vars',
  name: 'Convert Spring Boot application.yml to environment variables',
  summary:
    'Paste an application.yml and get the environment variable names Spring Boot\'s relaxed binding expects: dots to underscores, dashes removed, list indexes kept, as .env lines and a Kubernetes env: list.',
  category: 'DevOps & Config',
  primaryQuery: 'spring boot application.yml to environment variables',
  published: '2026-10-07',
  updated: '2026-11-06',
  related: ['yaml-to-env', 'decode-helm-release-secret', 'fix-bash-bad-interpreter'],
  steps: [
    step('parse', 'yaml_to_json', { indent: 2, allDocuments: true },
      'Parses the YAML into JSON so the keys can be walked. Always emitting an array means a file without --- sections arrives in the same shape as one with profile documents.',
      { label: 'parse application.yml' }),
    step('first-doc', 'jsonpath', { path: '$[0]', mode: 'first', indent: 2 },
      'Keeps the first YAML document, the base configuration. Sections after --- often hold profile overrides that Spring applies only when that profile is active, so they do not belong among the base variables, and json to .env needs a single object, not a list.',
      { label: 'keep the first document' }),
    step('dashes', 'sed', { script: DASHES, perLine: true },
      'Spring Boot documents that dashes are removed, not replaced: ddl-auto becomes DDLAUTO. Without this step json to .env writes DDL_AUTO, which Spring maps back to ddl.auto and binds only through a legacy fallback. It must run before flattening, while a dash is still distinguishable from a dot.',
      { label: 'remove dashes from keys' }),
    branch('formats', [
      [
        laneStep('env', 'json_to_env', { upperCase: true, delimiter: '_', quote: 'auto', exportPrefix: false }),
        laneStep('env-heading', 'sed', { script: String.raw`1s/^/# .env file (Docker Compose env_file)\n/`, perLine: true }),
      ],
      [
        laneStep('k8s-env', 'json_to_env', { upperCase: true, delimiter: '_', quote: 'always', exportPrefix: false }),
        laneStep('k8s-list', 'sed', { script: K8S, perLine: true }),
      ],
    ], { mode: 'concat', separator: '\n\n' },
    'Flattens the keys into names (dots and nesting become underscores, list items are numbered _0, _1, all upper case) twice: as .env lines quoted only where needed, and as a Kubernetes env: list with every value quoted, because Kubernetes rejects a bare 8080 or false.',
    { label: '.env and Kubernetes env:' }),
  ],
  samples: [
    {
      id: 'order-service',
      title: 'application.yml with a prod profile',
      input: 'server:\n  port: 8080\n  servlet:\n    context-path: /api\nspring:\n  application:\n    name: order-service\n  datasource:\n    url: jdbc:postgresql://orders-db.example.net:5432/orders\n    username: orders_app\n    password: ${DB_PASSWORD}\n    hikari:\n      maximum-pool-size: 20\n  jpa:\n    hibernate:\n      ddl-auto: validate\n    open-in-view: false\n  kafka:\n    bootstrap-servers:\n      - kafka-0.example.net:9092\n      - kafka-1.example.net:9092\nlogging:\n  level:\n    com.example.orders: DEBUG\n---\nspring:\n  config:\n    activate:\n      on-profile: prod\nserver:\n  port: 9090\n',
      output:
        '# .env file (Docker Compose env_file)\nSERVER_PORT=8080\nSERVER_SERVLET_CONTEXTPATH=/api\nSPRING_APPLICATION_NAME=order-service\nSPRING_DATASOURCE_URL=jdbc:postgresql://orders-db.example.net:5432/orders\nSPRING_DATASOURCE_USERNAME=orders_app\nSPRING_DATASOURCE_PASSWORD=\'${DB_PASSWORD}\'\nSPRING_DATASOURCE_HIKARI_MAXIMUMPOOLSIZE=20\nSPRING_JPA_HIBERNATE_DDLAUTO=validate\nSPRING_JPA_OPENINVIEW=false\nSPRING_KAFKA_BOOTSTRAPSERVERS_0=kafka-0.example.net:9092\nSPRING_KAFKA_BOOTSTRAPSERVERS_1=kafka-1.example.net:9092\nLOGGING_LEVEL_COM_EXAMPLE_ORDERS=DEBUG\n\nenv:\n  - name: SERVER_PORT\n    value: "8080"\n  - name: SERVER_SERVLET_CONTEXTPATH\n    value: "/api"\n  - name: SPRING_APPLICATION_NAME\n    value: "order-service"\n  - name: SPRING_DATASOURCE_URL\n    value: "jdbc:postgresql://orders-db.example.net:5432/orders"\n  - name: SPRING_DATASOURCE_USERNAME\n    value: "orders_app"\n  - name: SPRING_DATASOURCE_PASSWORD\n    value: \'${DB_PASSWORD}\'\n  - name: SPRING_DATASOURCE_HIKARI_MAXIMUMPOOLSIZE\n    value: "20"\n  - name: SPRING_JPA_HIBERNATE_DDLAUTO\n    value: "validate"\n  - name: SPRING_JPA_OPENINVIEW\n    value: "false"\n  - name: SPRING_KAFKA_BOOTSTRAPSERVERS_0\n    value: "kafka-0.example.net:9092"\n  - name: SPRING_KAFKA_BOOTSTRAPSERVERS_1\n    value: "kafka-1.example.net:9092"\n  - name: LOGGING_LEVEL_COM_EXAMPLE_ORDERS\n    value: "DEBUG"',
    },
    {
      id: 'flat-keys-windows',
      title: 'Dotted keys, saved on Windows',
      input: 'spring.application.name: billing-service\r\nspring.datasource.url: jdbc:sqlserver://billing-db.example.net:1433;databaseName=billing\r\nspring.datasource.hikari.connection-timeout: 30000\r\nspring.jpa.show-sql: true\r\nmanagement.endpoints.web.exposure.include: health,info\r\n',
      output:
        '# .env file (Docker Compose env_file)\nSPRING_APPLICATION_NAME=billing-service\nSPRING_DATASOURCE_URL=jdbc:sqlserver://billing-db.example.net:1433;databaseName=billing\nSPRING_DATASOURCE_HIKARI_CONNECTIONTIMEOUT=30000\nSPRING_JPA_SHOWSQL=true\nMANAGEMENT_ENDPOINTS_WEB_EXPOSURE_INCLUDE=health,info\n\nenv:\n  - name: SPRING_APPLICATION_NAME\n    value: "billing-service"\n  - name: SPRING_DATASOURCE_URL\n    value: "jdbc:sqlserver://billing-db.example.net:1433;databaseName=billing"\n  - name: SPRING_DATASOURCE_HIKARI_CONNECTIONTIMEOUT\n    value: "30000"\n  - name: SPRING_JPA_SHOWSQL\n    value: "true"\n  - name: MANAGEMENT_ENDPOINTS_WEB_EXPOSURE_INCLUDE\n    value: "health,info"',
    },
    {
      id: 'lists-and-quoting',
      title: 'Lists of objects and values with spaces',
      input: 'app:\n  report-cron: "0 30 6 * * MON-FRI"\n  webhooks:\n    - url: https://hooks.example.com/orders\n      events: [created, cancelled]\n    - url: https://hooks.example.org/billing\n      events: [paid]\nlogging:\n  pattern:\n    console: "%d{HH:mm:ss} %-5level %logger{36} - %msg%n"\n',
      output:
        '# .env file (Docker Compose env_file)\nAPP_REPORTCRON="0 30 6 * * MON-FRI"\nAPP_WEBHOOKS_0_URL=https://hooks.example.com/orders\nAPP_WEBHOOKS_0_EVENTS_0=created\nAPP_WEBHOOKS_0_EVENTS_1=cancelled\nAPP_WEBHOOKS_1_URL=https://hooks.example.org/billing\nAPP_WEBHOOKS_1_EVENTS_0=paid\nLOGGING_PATTERN_CONSOLE="%d{HH:mm:ss} %-5level %logger{36} - %msg%n"\n\nenv:\n  - name: APP_REPORTCRON\n    value: "0 30 6 * * MON-FRI"\n  - name: APP_WEBHOOKS_0_URL\n    value: "https://hooks.example.com/orders"\n  - name: APP_WEBHOOKS_0_EVENTS_0\n    value: "created"\n  - name: APP_WEBHOOKS_0_EVENTS_1\n    value: "cancelled"\n  - name: APP_WEBHOOKS_1_URL\n    value: "https://hooks.example.org/billing"\n  - name: APP_WEBHOOKS_1_EVENTS_0\n    value: "paid"\n  - name: LOGGING_PATTERN_CONSOLE\n    value: "%d{HH:mm:ss} %-5level %logger{36} - %msg%n"',
    },
  ],
}
export default preset
