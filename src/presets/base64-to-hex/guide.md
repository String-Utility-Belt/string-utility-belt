---
title: Base64 to Hex Converter: Hashes, Keys and Text as Hex Bytes
description: Convert a Base64 value to lowercase hex in two steps that keep every byte, so a hash, key or IV from a header or a config file matches what sha256sum prints.
---

## Why a text decoder gives the wrong hex

Most Base64-to-hex jobs start with something that is not text: a SHA-256 digest from a `Digest` or `Content-MD5` header, a key or IV from a config file, a Subresource Integrity hash, a certificate pin. A single Base64 decoder is built for text. It turns the bytes into characters, and when a byte sequence is not valid UTF-8, which a hash almost never is, it either stops with an error or quietly replaces the bad bytes with the replacement character. Hex-encode that and you get `efbfbd` where the real bytes were, a digest that is the right length but matches nothing.

This pipeline never treats the data as text. Its first step produces bytes, its second writes those bytes as hex, and the only thing that changes between input and output is the notation.

## What the two steps do

[Get bytes](/util/get_bytes/) in its Base64 mode reads the standard alphabet with `+` and `/`, accepts the `=` padding or its absence, and skips line breaks, so a value wrapped at 64 or 76 columns by `openssl base64` or a MIME encoder decodes in one piece. Its output is raw bytes, which is what the editor shows in the step's preview as a byte count and a hex and text rendering.

[Hex encode](/util/hex_encode/) accepts those bytes directly and writes each one as two lowercase digits with no separators, the layout `sha256sum`, `openssl dgst` and `xxd -p` use. That is deliberately the plainest form: it compares byte for byte with a digest printed on a server, and it pastes into a config file or a SQL `x'…'` literal without editing. For uppercase, insert a [change case](/util/case/) step after it; for `AB:CD` pairs or `0x` prefixes, a [chunk](/util/chunk/) step splits the digits into pairs and [prefix / suffix lines](/util/line_affix/) adds whatever each pair needs.

## Checking a hash against a header

A common reason to do this conversion is a mismatch report: a `Digest: sha-256=…` header or an SRI attribute carries Base64, while the tool on your machine prints hex. Paste the Base64 here, run `sha256sum` on the file, and compare the two hex strings. The length tells you the algorithm before you compare anything: 32 hex digits for MD5, 40 for SHA-1, 64 for SHA-256, 96 for SHA-384 and 128 for SHA-512. A value that decodes to a different length than you expected is not the hash you think it is.

The opposite direction, hex into Base64 for a header or an SRI attribute, is the [hex to Base64](/presets/hex-to-base64/) preset.

## Limits

The input must be standard Base64. A URL-safe value with `-` and `_`, such as a JWT segment, fails in the first step; run it through [Base64URL decode](/util/base64url_decode/) in the editor instead, or replace the two characters with `+` and `/` first. A value that was also percent-encoded, with `%3D` for the padding, needs [URL decode](/util/url_decode/) in front, which is what the [URL-encoded Base64](/presets/url-decode-base64/) preset does.

Everything runs in your browser; the value you paste is not uploaded. If the Base64 you are converting hides a JSON document rather than bytes, the [Base64 to JSON](/presets/base64-to-json/) preset decodes it as text and formats it.

## Keeping it for next time

Open in the editor keeps both steps, so you can add the case or formatting step you need and save the result to your library under a name like "digest to hex". The same two steps run anywhere the engine does: the `subelt` command-line tool runs a saved pipeline file, and the browser and VS Code extensions run saved pipelines on selected text. On a Unix shell the equivalent one-liner is `echo 'uU0nuZNNPgilLlLX2n2r+sSE7+N6U4DukIj3rOLvzek=' | base64 -d | xxd -p -c 256`, which prints the same 64 digits as the first example.
