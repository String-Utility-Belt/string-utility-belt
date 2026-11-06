---
title: URL Decode Base64 Online: Read a Base64 Value From a URL
description: Decode a Base64 parameter copied from a URL in two steps: percent-decode the %3D, %2B and %2F first, then Base64-decode, and read the state, token or path.
---

## Why the value from the URL will not decode

Base64 uses three characters that have jobs of their own in a URL: `+`, `/` and `=`. When an application puts a Base64 value into a query string, it percent-encodes them, so a token that ends in `==` arrives as `…%3D%3D` and a `/` in the middle becomes `%2F`. Paste that into a Base64 decoder and it either reports an invalid character at the first `%` or, worse, tolerates it and returns the wrong bytes. People searching for a "URL decode Base64" tool have usually hit exactly this: the value looks like Base64, and it is, underneath one more layer.

The order matters. Percent-decoding has to come first, because it restores the Base64 alphabet; Base64-decoding first fails on the `%`. Done the other way around, the two steps also cannot be swapped by accident here: the pipeline runs them in the order shown, and the preview after step one lets you see the restored value before it is decoded.

## What each step does

[URL decode](/util/url_decode/) replaces every `%XX` escape with the byte it stands for, so `%3D` becomes `=`, `%2B` becomes `+` and `%2F` becomes `/`. A value that was never encoded passes through unchanged, which the third example shows. One thing it does not do is turn `+` into a space: that is a form-encoding convention, and a `+` in a Base64 value must stay a `+`, so this is the right behaviour here even though a general-purpose query-string parser would do otherwise.

[Base64 decode](/util/base64_decode/) turns the restored value into UTF-8 text. For a `state` parameter from an OAuth callback that is a small JSON object; for a token it is the `name:secret` pair or opaque text the application chose. A value whose bytes are not text, such as an encrypted blob, fails at this step by design instead of coming out as replacement characters; for those, swap the second step for [Get bytes](/util/get_bytes/) in Base64 mode and read the hex preview, or use the [Base64 to hex](/presets/base64-to-hex/) preset.

## Reading what comes out

A decoded `state`, `return_to` or `next` value is often JSON on one line; add a [JSON pretty print](/util/json_pretty/) step to indent it, or start from the [URL-encoded JSON](/presets/url-decode-json/) preset when the JSON itself was percent-encoded without Base64. A value that is still unreadable after both steps may be URL-safe Base64, with `-` and `_` instead of `+` and `/` and no padding, which many frameworks use precisely so that no percent-encoding is needed: replace the second step with [Base64URL decode](/util/base64url_decode/).

Paste the parameter value on its own, not the whole URL. Decoding a complete URL would turn the `&` and `=` between parameters into part of the text and the Base64 step would then fail on them. To pull one parameter out of a full URL first, put a [query string to JSON](/util/query_string_to_json/) step in front in the editor.

## Privacy and reuse

Everything runs in your browser and the value is not uploaded, which matters because tokens in URLs are credentials. Treat the decoded text the same way.

Open in the editor gives you both steps to extend, for example with the JSON formatting step, and save to your library. The browser extension runs saved pipelines on text you select on any page, which is a quick way to read such a parameter straight from a link; the `subelt` command-line tool runs the saved pipeline file over a log of URLs. Nothing else is needed on a Unix shell for a single value: `printf '%b' "${value//%/\\x}" | base64 -d` does the same two steps, with the usual care about quoting.
