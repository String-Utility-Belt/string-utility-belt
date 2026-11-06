---
title: Base64 to JSON Converter: Decode and Pretty-Print in One Go
description: Decode a Base64 string that holds JSON, such as a Pub/Sub message, a .dockerconfigjson value or a config blob, and read it indented, one field per line.
---

## Where Base64-wrapped JSON turns up

A lot of systems move JSON around inside Base64. Google Cloud Pub/Sub delivers every message body as a Base64 `data` field, and so do AWS Kinesis records and EventBridge archives. Kubernetes stores registry credentials as a `.dockerconfigjson` value, which is Base64 of a JSON document. Service account keys, feature-flag payloads and app settings are often handed to a container through one environment variable holding Base64, because a one-line value survives shells, YAML and CI secret stores that a multi-line JSON document would not. Reading any of them means two operations, and the second one is the one people forget: after decoding, the JSON is a single long line.

## What the two steps do

[Base64 decode](/util/base64_decode/) turns the value into the UTF-8 text it encodes. It accepts the standard alphabet with or without `=` padding and ignores line breaks inside a wrapped value, so a value copied out of a YAML file in two lines decodes in one piece. If the decoded bytes are not valid text the step stops with an error, which is the right outcome: a value that fails here is not JSON, however it looks.

[JSON pretty print](/util/json_pretty/) parses the text and prints it again with two-space indentation. Parsing is also validation: a truncated copy or a value that was Base64 of something else fails with a position, instead of showing half a document. Set the indent to 4 in the editor if your team's files use that, or to 0 to minify instead.

## When the first step is not enough

A `.dockerconfigjson` document contains a second Base64 value, the `auth` field, which is `username:password` encoded once more; paste that field into the [Basic auth decoder](/presets/decode-basic-auth-header/) preset to read it. A JWT looks like three Base64 pieces but uses the URL-safe alphabet and carries no padding, so this preset rejects it; the [JWT decoder](/util/jwt_decode/) reads it directly.

A value from a URL has its `=` padding written as `%3D`: run the [URL-encoded Base64](/presets/url-decode-base64/) preset instead, or add a [URL decode](/util/url_decode/) step in front. A gzipped payload, which starts with `H4sI` in Base64, needs decompression rather than decoding; the [CloudWatch Logs](/presets/decode-cloudwatch-logs-data/) preset handles the most common one.

Pub/Sub, Kinesis and SQS deliver the Base64 inside a JSON envelope of their own. Paste just the `data` value here, or add a [JSONPath query](/util/jsonpath/) step in front with `$.message.data` to pick it out of the whole push request.

## Handling it safely and keeping the pipeline

Decoded registry credentials, service account keys and message bodies are secrets or customer data. Both steps run in your browser and the value is never uploaded, and the page keeps nothing you paste; clear the input box before you walk away from a shared screen.

Open in the editor turns the page into a pipeline you can extend, with the JSONPath or URL decode step added in front, and save to your library. From there the `subelt` command-line tool runs the saved pipeline over files or stdin, the MCP server exposes it to an AI assistant, and the VS Code extension runs it on a selected value in a YAML file. On a shell with jq the same two steps are `echo "$value" | base64 -d | jq .`, which is handy until the value sits in a Pub/Sub envelope, where `jq -r .message.data | base64 -d | jq .` is the equivalent of adding the JSONPath step.
