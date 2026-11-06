---
title: Hex to Base64 Converter: Digests, Fingerprints, Byte Arrays
description: Turn hex bytes from sha256sum, an openssl fingerprint with colons, a sha256: digest or a 0x byte array into standard Base64 for headers, SRI hashes and JSON.
---

## Where hex comes from and why it is never clean

Hex is how command-line tools print bytes. `sha256sum` and `shasum` print a digest as 64 digits; `openssl x509 -fingerprint` prints `sha256 Fingerprint=` and then the bytes as `B9:4D:27:…`; a container registry names an image `sha256:` followed by the digest; a firmware header or a test vector arrives as a C array of `0x2b, 0x7e, …`; `xxd -p` wraps a dump at 60 columns. Base64 is what the web wants the same bytes as: `Digest` and `Content-MD5` headers, Subresource Integrity attributes (`sha384-…`), JSON fields, Kubernetes Secret values, HPKP-style pins.

Every one of those hex sources carries characters that are not hex, and a decoder stops at the first colon or `0x`. Removing them by hand works once. The point of a pipeline is that the clean-up, the decode and the encode are one saved thing you paste into.

## The three steps

The first step is a [find and replace](/util/replace/) with a single regular expression that deletes a label ending in `=` at the start, a `sha256:`-style prefix, every `0x` or `\x`, and every space, line break, colon, comma and dash. Only hex digits are left. It is not a general "strip everything but hex" rule, on purpose: a label like `Fingerprint` contains hex letters, and stripping blindly would leave `fee` from it in the data.

[Hex decode](/util/hex_decode/) reads pairs of digits as bytes and fails loudly on an odd count or a stray character. That is the check that the first step did its job: if a line of your dump had a prefix this preset does not know, the error names it before anything is encoded.

[Base64 encode](/util/base64_encode/) takes the bytes and writes standard Base64, with `+`, `/` and `=` padding and no line breaks. The three examples that start from the same SHA-256 digest end with the same 44-character value, which is the easiest way to see that the labels and separators changed nothing.

## Getting the right Base64 flavour

HTTP headers, SRI and JSON APIs take standard Base64, which this preset produces. JWTs and some URL parameters use the URL-safe alphabet without padding: add a [Base64URL encode](/util/base64url_encode/) step in place of the last one. A value destined for a URL query string needs percent-encoding on top, so `+`, `/` and `=` survive the trip: add [URL encode](/util/url_encode/) after the Base64 step.

An SRI attribute is the Base64 of the raw digest, which is what you get from `openssl dgst -sha384 -binary file | base64`; converting the hex digest with this preset gives the same string, so `sha384-` followed by the output is a valid `integrity` value. A certificate fingerprint, on the other hand, is the hash of the whole certificate, not of its public key, so converting it does not give a `pin-sha256` value.

## Going the other way, and keeping this one

The reverse conversion, Base64 into hex to compare with a digest printed on the command line, is the [Base64 to hex](/presets/base64-to-hex/) preset. Both run in your browser without uploading the value.

Open in the editor turns the page into a working pipeline you can change, for instance by adding the URL-safe step, and save to your library; the `subelt` command-line tool runs the same saved pipeline file in a script, and the VS Code extension runs it on a selection. The shell equivalent for a bare digest is `echo b94d27…cde9 | xxd -r -p | base64`, but it has no answer for the colons and labels, which is where the first step earns its place.
