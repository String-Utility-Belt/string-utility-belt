---
title: URL Decode JSON Online: Read JSON From a Query String
description: Turn a percent-encoded JSON value from a URL parameter or cookie into readable, indented JSON: undo the %7B, %22 and %2C escapes, then parse and pretty-print.
---

## Why JSON in a URL looks like line noise

Braces, quotes, colons, commas and brackets all have meanings in a URL, so when an application passes a JSON object as a query parameter or stores one in a cookie, every one of those characters becomes a `%XX` escape. `{"status":"open"}` turns into `%7B%22status%22%3A%22open%22%7D`, and a filter with a few fields fills a whole line of the address bar. The browser's developer tools show the decoded form for some parameters and not others, and a cookie value is shown exactly as stored.

Reading it back is two operations: percent-decoding, which restores the characters, and formatting, which turns one long line into something you can scan. A URL decoder alone stops after the first and leaves you counting braces.

## What the steps do

[URL decode](/util/url_decode/) replaces each `%XX` escape with the character it encodes, including the multi-byte sequences for accented letters and emoji, which are percent-encoded as UTF-8. It leaves a `+` alone rather than turning it into a space; a JSON value that went through form encoding and contains spaces would show them as `+`, and for those a [find and replace](/util/replace/) step turning `+` into a space before the parse fixes it.

[JSON pretty print](/util/json_pretty/) parses the decoded text and prints it with two-space indentation. If the parameter was cut short by a copy, or was encoded twice so that `%257B` decodes only to `%7B`, the parse fails and says where, which is more useful than a half-decoded string: it tells you the application encoded the value twice or the link was truncated. For the double-encoded case, duplicate the first step in the editor.

## Pasting the right thing

Paste the parameter's value, not the whole URL. A complete URL decodes to a URL with JSON embedded in it, and the second step then fails on the `https://` in front. To go from a full URL, put a [query string to JSON](/util/query_string_to_json/) step first and pick the field you want with [JSONPath query](/util/jsonpath/). A cookie header with several cookies works the same way: take the one value after `name=`.

A value that decodes to something that still is not JSON may be Base64 underneath, which is the case for many `state` and `next` parameters; the [URL-encoded Base64](/presets/url-decode-base64/) preset decodes those. JSON that arrives with backslashes before every quote has been stringified rather than percent-encoded; the [unescape stringified JSON](/presets/unescape-stringified-json/) preset handles that.

## Privacy and reuse

Both steps run in your browser and the value is not uploaded, which matters when the parameter is a session cookie or carries a customer's filter. The page stores nothing you paste.

Open in the editor keeps the two steps so you can add the query-string or Base64 step in front and save the result to your library. A saved pipeline runs the same way from the browser extension on text selected in a page, from the VS Code extension on a selection in a log file, and from the `subelt` command-line tool over a file of captured requests. On a shell, `python3 -c 'import sys,urllib.parse as u,json;print(json.dumps(json.loads(u.unquote(sys.argv[1])),indent=2))' "$value"` is the same pair of steps for one value.
