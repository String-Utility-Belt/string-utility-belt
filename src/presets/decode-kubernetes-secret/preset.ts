import type { Preset } from '../types'
import { each, laneStep, step } from '../define'

const preset: Preset = {
  slug: 'decode-kubernetes-secret',
  name: 'Decode a Kubernetes Secret',
  summary:
    'Paste a Secret from kubectl get secret -o yaml or -o json and read every value under data in plain text, with the keys kept, instead of decoding each one with base64 by hand.',
  category: 'DevOps & Config',
  primaryQuery: 'kubectl get secret decode',
  published: '2026-10-07',
  updated: '2026-11-06',
  related: ['env-file-to-kubernetes-secret', 'decode-helm-release-secret', 'spring-boot-yaml-to-env-vars'],
  steps: [
    step('to-json', 'yaml_to_json', { indent: 2, allDocuments: false },
      'kubectl prints a Secret as YAML by default and as JSON with -o json. JSON is also valid YAML, so one parse handles both and hands the next step a JSON document.'),
    step('pick-data', 'jsonpath', { path: '$.data', mode: 'first', indent: 2 },
      'Keeps only the data map, where Kubernetes stores every value Base64-encoded. Metadata such as the name, namespace and uid is dropped, so nothing else gets decoded by mistake.',
      { label: 'keep data' }),
    each('decode-values', { mode: 'json-values' }, [laneStep('b64', 'base64_decode')],
      'Decodes every value of the data map on its own and writes it back under the same key. One step covers a Secret with two keys or twenty, and the key order stays as kubectl printed it.',
      { label: 'decode every value' }),
  ],
  samples: [
    {
      id: 'opaque-yaml',
      title: 'Opaque Secret (kubectl -o yaml)',
      input: `apiVersion: v1
data:
  DB_HOST: cG9zdGdyZXMucGF5bWVudHMuc3ZjLmNsdXN0ZXIubG9jYWw=
  DB_NAME: YmlsbGluZw==
  DB_PASSWORD: Y29ycmVjdC1ob3JzZS1iYXR0ZXJ5LXN0YXBsZQ==
  DB_PORT: NTQzMg==
  DB_USER: YmlsbGluZ19hcHA=
kind: Secret
metadata:
  creationTimestamp: "2026-10-01T09:14:22Z"
  name: db-credentials
  namespace: payments
  resourceVersion: "48213311"
  uid: 7a1c5e2b-3d4f-4a6b-9c8d-0e1f2a3b4c5d
type: Opaque
`,
      output: `{
  "DB_HOST": "postgres.payments.svc.cluster.local",
  "DB_NAME": "billing",
  "DB_PASSWORD": "correct-horse-battery-staple",
  "DB_PORT": "5432",
  "DB_USER": "billing_app"
}`,
    },
    {
      id: 'basic-auth-json',
      title: 'basic-auth Secret (kubectl -o json)',
      input: `{
    "apiVersion": "v1",
    "data": {
        "password": "czNjcjN0LVQwa2VuLTIwMjY=",
        "username": "Y2ktcm9ib3Q="
    },
    "kind": "Secret",
    "metadata": {
        "creationTimestamp": "2026-09-18T15:02:41Z",
        "name": "registry-mirror-auth",
        "namespace": "ci",
        "resourceVersion": "39120554",
        "uid": "c2d9e8f1-6a7b-4c3d-8e9f-1a2b3c4d5e6f"
    },
    "type": "kubernetes.io/basic-auth"
}
`,
      output: `{
  "password": "s3cr3t-T0ken-2026",
  "username": "ci-robot"
}`,
    },
  ],
}

export default preset
