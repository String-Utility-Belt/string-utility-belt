---
title: Kubernetes Secret From Env File: .env to Secret Manifest
description: Kubernetes Secret from env file: paste a .env and get a manifest with every value Base64-encoded under data, quotes, comments and multi-line values handled.
---

## Why kubectl --from-env-file is not enough

The quick route from a `.env` file to a Secret, the kubectl create secret from env file command most guides give, is `kubectl create secret generic app-env --from-env-file=.env --dry-run=client -o yaml`. It reads every line as `KEY=value` and nothing more, which is not how the file was written for the tools that normally read it. Checked with kubectl 1.37:

- Quotes stay in the value. `DATABASE_URL="postgres://…"` is stored with both quote marks, and the connection string your app reads starts with `"`.
- An inline comment becomes part of the value: `REDIS_URL=redis://cache:6379/0  # session store` stores the comment and the spaces before it. Trailing whitespace is kept too.
- `export NODE_ENV=production`, common in files that are also sourced by a shell, is rejected as an invalid key.
- A quoted value spread over several lines, such as a PEM certificate, is rejected.

None of these produce an obvious error in the cluster. The Secret applies cleanly and the pod gets a value that is subtly wrong.

## What each step does

[.env to JSON](/util/env_to_json/) parses the file the way application loaders do: comments and blank lines are skipped, an `export` prefix is dropped, quotes are removed, escapes such as `\n` inside double quotes are decoded, and a quoted value may span lines. An unquoted value ends where a `#` follows a space, which matches python-dotenv and Docker Compose. Node's `dotenv` package cuts an unquoted value at any `#`, so quote every value that contains one, and all three read it alike. References such as `${DB_HOST}` are kept as written; tick expand ${VAR} in step 1 to substitute values defined earlier in the file. A line that is not `KEY=value` stops the preset there, with its line number, instead of producing a half-empty Secret.

The second step runs [Base64 encode](/util/base64_encode/) on every value of the resulting object on its own, so each variable keeps its name and gets its own encoded value, which is what a Secret's `data` field holds. An empty value stays empty. A [replace](/util/replace/) then wraps the map in a `v1` Secret of type `Opaque`, and [JSON to YAML](/util/json_to_yaml/) writes the manifest in the order of your file.

The preset fills `data`, not `stringData`. `stringData` accepts plain text and would make the encoding step unnecessary, but kubectl parses manifests as YAML 1.1, where an unquoted `on`, `off`, `yes` or `no` is a boolean: `ENABLE_SIGNUPS: on` would reach the cluster as `true`. Base64 text never looks like a boolean or a number, so every value arrives exactly as written.

## Limits and things to check

- Variable names are not quoted, and kubectl's YAML 1.1 parser reads the names `y`, `n`, `yes`, `no`, `on` and `off`, in any case, as booleans: a variable called `ON` turns into a key named `true`. Rename such variables, or quote those keys in the output.
- The Secret is named `app-env` in step 3, with no namespace. Change the name there to the one your Deployment's `envFrom` or `secretKeyRef` uses, and add a namespace to the metadata or pass `-n` to `kubectl apply`.
- Keys are not checked against what Kubernetes allows in a Secret (letters, digits, `-`, `_` and `.`). A key with any other character is rejected by the API server when you apply the manifest.
- Base64 is an encoding, not encryption. Anyone who can read the manifest can read every value, so do not commit it to a repository as it is: encrypt it with [SOPS](https://github.com/getsops/sops) or turn it into a [Sealed Secret](https://github.com/bitnami-labs/sealed-secrets) first.

To read a Secret back, the [decode a Kubernetes Secret](/presets/decode-kubernetes-secret/) preset does the reverse.

## What happens to what you paste

The preset runs in your browser, and this page stores nothing you type. Two things on it do keep a copy, though. "Open in the editor" hands your input to the editor, which remembers recent inputs in this browser (in IndexedDB) so you can bring them back: to stop that, open the History menu on the editor's input panel and untick remember inputs, and use clear all to remove what is already there. A share link from the editor carries the input in the address after the `#`, so a link made from a real `.env` file is a copy of its secrets. Use made-up values when you want to show someone the result.
