---
title: kubectl get secret decode: Read a Kubernetes Secret Online
description: Decode a Kubernetes Secret online: paste kubectl get secret -o yaml or -o json output and read every Base64 data value as plain text under its key.
---

## Why the values in a Secret look scrambled

A Kubernetes Secret keeps its payload under `data`, and the API server returns every value there Base64-encoded. That is an encoding, not encryption: anyone who can read the Secret can read the values, they just cannot do it at a glance. When you are checking which database host a pod is pointed at, or whether a rotated password actually landed, the encoded form gets in the way. The usual answer is to copy one value at a time into `base64 --decode`, which is slow for a Secret with a dozen keys and easy to get wrong when a value ends in padding or wraps across lines in a terminal.

This preset decodes the whole map in one go, with no `kubectl get secret … -o jsonpath` and `base64 --decode` to type for each key. Paste the Secret as `kubectl get secret <name> -o yaml` prints it, or the JSON from `-o json`, and every value comes back as readable text under its original key.

## What each step does

[yaml to json](/util/yaml_to_json/) reads the Secret in either format, since JSON parses as YAML too. [jsonpath query](/util/jsonpath/) with `$.data` keeps the map of encoded values and nothing else, so the name, namespace, uid and labels never reach the decoder. In `first` mode it hands over the object itself rather than an array holding it.

The last step is a run on each step over the values of that object. It hands each value to [base64 decode](/util/base64_decode/) separately and writes the result back under the same key, keeping the keys in the order kubectl printed them. A Secret with two keys and one with forty go through the same three steps, and a value that is already empty stays empty rather than being decoded.

## Limits and gotchas

Values are decoded as UTF-8 text. That covers passwords, tokens, hostnames, connection strings and PEM certificates, which are text underneath. A binary value, such as a Java keystore or a raw key file, comes out as replacement characters; decode that one key on its own with the base64 decode utility and save the bytes instead.

A `.dockerconfigjson` value decodes to JSON text, so it shows as one escaped string. Copy it out and run it through [json pretty](/util/json_pretty/) to read the registry credentials.

`stringData` never appears in what kubectl returns: the API server folds it into `data` when the Secret is written, so this preset sees it there. A list of Secrets from `kubectl get secrets -o yaml` keeps them under `items`, where `$.data` finds nothing; paste one Secret at a time.

The decoded output is exactly as sensitive as the Secret. The steps run in your browser and the pasted text is not uploaded, but clear the input when you are done, and do not paste production credentials into a shared screen.

## The same thing from a terminal

With kubectl and jq, this decodes every value of one Secret:

`kubectl get secret db-credentials -n payments -o json | jq '.data | map_values(@base64d)'`

Without jq, `kubectl get secret db-credentials -n payments -o go-template='{{range $k, $v := .data}}{{$k}}={{$v | base64decode}}{{"\n"}}{{end}}'` prints one key per line. For a single key, `-o jsonpath='{.data.DB_PASSWORD}' | base64 --decode` is enough. To go the other way and turn the decoded values into an env file, the [Spring Boot YAML to environment variables](/presets/spring-boot-yaml-to-env-vars/) preset shows the naming rules most deployments follow.
