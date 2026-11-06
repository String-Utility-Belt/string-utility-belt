---
title: Bulk Base64 Decode: Decode a Whole Column of Values at Once
description: Decode many Base64 strings at once, one per line, from a spreadsheet column, a JSON array or a quoted CSV, with headers and blank rows kept so the rows line up.
---

## Why one decoder is not enough for a list

A Base64 decoder takes one value. Paste a column of fifty into it and it either treats the whole column as a single value, which fails at the first line break, or silently joins the lines and decodes them together into garbage. The lists people actually have are worse than a clean column: a header row at the top, blank rows where a cell was empty, quotes around every value because the column came out of a CSV export, a comma after each because it was copied from a JSON array, and Windows line endings. A bulk tool has to leave all of that where it was and decode only the values, so that row 17 of the output is still row 17 of the input and can be pasted back next to it.

That is what a run-on-each step is for: the pipeline splits the input into lines, runs the decoder on each line separately, and joins the results again in the same order.

## What the steps do

The first step is a [find and replace](/util/replace/) over every line that removes the indentation, the quotes and the trailing comma a JSON array or a CSV export wraps a value in. It touches nothing inside the value and never a line break, so the number of lines is the same after it as before. The JSON array example shows the other common shape going in: the brackets on their own lines are left alone, because they are not Base64 and the next step will not try to decode them.

The second step is a run on each line that hands every line to [Base64 decode](/util/base64_decode/) on its own, guarded by a condition: a line is decoded only if it is shaped like Base64, meaning it contains only the Base64 characters, has a length that Base64 can produce, and carries padding only at the end. A header such as `Value`, a bracket or an empty row does not match and passes through as it was, which is why the output still has the header and the blank line in place. Empty lines are skipped before the condition is even checked, and a `\r` at the end of a Windows line is set aside and put back.

## What can still go wrong

A short word that happens to be shaped like Base64, such as a four- or eight-letter header, matches the condition and is decoded; if its bytes are not valid text the decoder reports an error for that line and the line is kept as it was. A URL-safe value with `-` or `_` does not match the condition and is left undecoded: change the step inside to [Base64URL decode](/util/base64url_decode/) in the editor. A value that decodes to several lines of text, such as a certificate, comes out as several lines, and the rows below it shift; a `key: value` layout, as in a Kubernetes Secret, is better served by the [decode a Kubernetes Secret](/presets/decode-kubernetes-secret/) preset, which decodes the values and keeps the keys.

Binary values decode to an error for that line rather than to replacement characters, and the line is left encoded. Everything runs in your browser; the list is not uploaded.

## Reuse and the command line

Open in the editor to adjust the condition, swap the decoder for the URL-safe one, or add a [JSON pretty print](/util/json_pretty/) step inside the run-on-each for a column of Base64 JSON, then save it to your library and paste the next export into the same pipeline. The `subelt` command-line tool runs a saved pipeline file over a whole file, and the editor offers to save the pipeline to the browser extension when the installed version can run every step in it. The shell equivalent for a clean column is `while IFS= read -r line; do printf '%s\n' "$line" | base64 -d; echo; done < values.txt`, which does nothing about quotes, headers or blank rows; those are the reason this is a pipeline rather than a loop.
