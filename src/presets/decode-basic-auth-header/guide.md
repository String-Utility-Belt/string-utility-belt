---
title: Basic Auth Decoder: Read the User Name and Password
description: Decode an Authorization: Basic header to its user name and password, from the header line, a curl command, a log or the bare token, split at the first colon.
---

## What a Basic auth header contains

HTTP Basic authentication sends the credentials in every request as `Authorization: Basic` followed by a token. The token is the user-id, a colon and the password, Base64-encoded. That is all: no hashing, no encryption, no secret. Anyone who can see the header can read the password, which is why it is only acceptable over TLS and why support tickets, HAR files and proxy logs that contain it are sensitive.

Decoding one by hand is three small chores: find the token in whatever you pasted, Base64-decode it, and work out where the user name ends. The last one is where hand-decoding goes wrong, because a password may contain colons.

## What each step does

The first step is a [find and replace](/util/replace/) that keeps only the token. Its pattern looks for the word `Basic`, in any case, followed by a run of Base64 characters, anywhere in the input, and throws the rest away. That covers the header on its own, a `Proxy-Authorization` header, the `-H` argument of a curl command, a request captured by a proxy, and a log line. Input with no `Basic` in it is treated as the bare token and left alone, so pasting just the Base64 works too.

[Base64 decode](/util/base64_decode/) then produces the `user-id:password` text. If the decode fails, the token was cut short when it was copied, or it is not Basic authentication at all: a token that starts with `eyJ` is a JWT, which belongs in the [JWT decoder](/util/jwt_decode/), and `Bearer` tokens are opaque.

The last step is a second find and replace that writes `username:` and `password:` on their own lines, splitting at the first colon. RFC 7617 forbids a colon in the user-id and allows any number in the password, so the first colon is the only correct split. The third example, with a password containing a colon, shows why a tool that splits at the last colon, or at every colon, gives a different and wrong answer. To keep the raw `user:password` form instead, disable that step in the editor.

## Character sets and odd cases

The decoded bytes are read as UTF-8. Most clients send UTF-8 today, and a server advertising `charset="UTF-8"` in its challenge asks for it; an old client may have sent Latin-1, in which case an accented character in the password shows as an error at the decode step. Decode that token with the [charset decode](/util/charset_decode/) utility set to `windows-1252` after a Base64-to-bytes step.

An empty password is legal and appears as `password:` with nothing after it. A token whose decoded text has no colon is not Basic credentials, and the last step leaves it as it is so you can see what it was.

## Handling the result

The output is a plaintext password. The whole pipeline runs in your browser; nothing you paste is sent anywhere, and the page keeps no history of it. Do not paste a decoded header into a ticket or chat; if the credentials appear in a log you were sent, that log is the problem to fix.

Open in the editor keeps the three steps so you can add a [JSON pretty print](/util/json_pretty/) step for a header whose password is a JSON blob, or remove the labelling step, and save the pipeline to your library. A saved pipeline runs from the browser extension on a header selected in a page, from the VS Code extension on a line in a HAR or log file, and from the `subelt` command-line tool in a script. On a shell, `echo "$token" | base64 -d` does the decoding for a bare token, and the split is up to you.
