import type { Preset } from '../types'
import { step } from '../define'

const preset: Preset = {
  slug: 'base64-to-json',
  name: 'Decode Base64 to formatted JSON',
  summary:
    'Paste a Base64 blob that hides a JSON document, such as a Pub/Sub message body, a .dockerconfigjson value or a config passed through an environment variable, and read it indented, one field per line.',
  category: 'Web & APIs',
  primaryQuery: 'base64 to json',
  published: '2026-11-06',
  related: ['url-decode-json', 'base64-to-hex', 'decode-kubernetes-secret'],
  steps: [
    step('b64', 'base64_decode', {},
      'Decodes the Base64 into the UTF-8 text underneath, which for these payloads is a single line of JSON. Wrapped values are fine; a value that is not text fails here instead of producing broken JSON.',
      { label: 'decode the Base64' }),
    step('pretty', 'json_pretty', { indent: 2 },
      'Parses the text as JSON, which also checks that it is JSON, and prints it with two-space indentation so nested objects and arrays can be read without counting braces.',
      { label: 'format the JSON' }),
  ],
  samples: [
    {
      id: 'pubsub-message',
      title: 'Pub/Sub message data',
      input: 'eyJvcmRlcklkIjoib3JkXzdIcTJMbVg5Iiwic3RhdHVzIjoicGFpZCIsImFtb3VudCI6NDk5OSwiY3VycmVuY3kiOiJVU0QiLCJpdGVtcyI6W3sic2t1IjoiVEJMLTAwNDIiLCJxdHkiOjF9XSwicGFpZEF0IjoiMjAyNi0xMS0wNlQxNDowMjoxN1oifQ==',
      output: '{\n  "orderId": "ord_7Hq2LmX9",\n  "status": "paid",\n  "amount": 4999,\n  "currency": "USD",\n  "items": [\n    {\n      "sku": "TBL-0042",\n      "qty": 1\n    }\n  ],\n  "paidAt": "2026-11-06T14:02:17Z"\n}',
    },
    {
      id: 'dockerconfigjson',
      title: '.dockerconfigjson from a Kubernetes Secret',
      input: 'eyJhdXRocyI6eyJyZWdpc3RyeS5leGFtcGxlLmNvbSI6eyJ1c2VybmFtZSI6ImNpLWJvdCIsInBhc3N3b3JkIjoickc3I3BMMnEiLCJhdXRoIjoiWTJrdFltOTBPbkpITnlOd1RESngifX19',
      output: '{\n  "auths": {\n    "registry.example.com": {\n      "username": "ci-bot",\n      "password": "rG7#pL2q",\n      "auth": "Y2ktYm90OnJHNyNwTDJx"\n    }\n  }\n}',
    },
    {
      id: 'config-blob',
      title: 'App config from an environment variable',
      input: 'eyJhcGlCYXNlVXJsIjoiaHR0cHM6Ly9hcGkuZXhhbXBsZS5jb20vdjIiLCJmZWF0dXJlcyI6eyJkYXJrTW9kZSI6dHJ1ZSwiYmV0YUNoZWNrb3V0IjpmYWxzZX0sInJldHJpZXMiOjMsInJlZ2lvbnMiOlsidXMtZWFzdC0xIiwiZXUtd2VzdC0xIl19',
      output: '{\n  "apiBaseUrl": "https://api.example.com/v2",\n  "features": {\n    "darkMode": true,\n    "betaCheckout": false\n  },\n  "retries": 3,\n  "regions": [\n    "us-east-1",\n    "eu-west-1"\n  ]\n}',
    },
  ],
}
export default preset
