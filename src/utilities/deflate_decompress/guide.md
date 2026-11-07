---
title: DEFLATE Decompress Online: zlib and Raw Inflate
description: Deflate online decoder: inflate zlib-wrapped or raw DEFLATE data, auto-detected by default, to text or bytes, with the zlib Adler-32 checksum verified.
---
## What is DEFLATE decompression?

DEFLATE ([RFC 1951](https://www.rfc-editor.org/rfc/rfc1951)) is the compression algorithm behind zlib,
gzip, PNG, and ZIP entries. On its own a raw DEFLATE stream is just compressed bits with no header, no
length, and no checksum, so it is almost always wrapped in something that adds those. This tool
reverses that: it inflates a DEFLATE stream, with or without the zlib wrapper, back into the
original bytes, and pairs with [deflate compress](/util/deflate_compress/), which produces the
streams it reads.

## How it works

The **format** option tells the decoder what wrapper to expect. `auto` (the default) looks at the
first two bytes: a valid zlib header ([RFC 1950](https://www.rfc-editor.org/rfc/rfc1950), a specific
byte pattern that raw DEFLATE streams from standard encoders never start with) is decoded as zlib, and
anything else is decoded as raw DEFLATE. `zlib` and `raw` skip the detection and force one
interpretation, for when you already know which one you have.

```example
title: auto-detected zlib stream to text
input-encoding: hex
input: 789cf348cdc9c9d751707175f3710c7155040025c40457
params: {"format": "auto", "output": "text"}
output: Hello, DEFLATE!
```

A raw stream (the bare compressed bits with no header or trailer at all) has no zlib header, so
`auto` already decodes it as raw; setting `format: raw` just makes that explicit:

```example
title: decoding a raw (unwrapped) stream
input-encoding: hex
input: f348cdc9c9d751284a2c5748494dcb492c49550400
params: {"format": "raw"}
output: Hello, raw deflate!
```

For a zlib stream, the decoder also recomputes the Adler-32 checksum stored in the last 4 bytes and
compares it against the decompressed data. The fflate library's own inflate does not check this on its own, so
without this step a single flipped bit could decompress to silently wrong output instead of an error.
A mismatch raises "zlib integrity check failed" rather than returning bytes that merely look plausible.

This tool also accepts a zlib or raw DEFLATE stream typed as plain text (a hex string, a Base64
string, or a "binary string" where each character's code is one byte) and figures out the transport
on its own, so you can paste output copied from another tool without a separate decode step first:

```example
title: a base64-encoded zlib stream needs no separate decode step
input: eNrzSM3JyddRqMrJTFIEABtlBBM=
output: Hello, zlib!
```

## Options

- **format**: `auto` (default) detects zlib vs. raw from the header; `zlib` and `raw` force one
  reading.
- **output**: `text` (default) decodes the result as UTF-8; `bytes` returns the raw decompressed
  bytes untouched, for binary payloads.

## Common uses

- Reading a zlib-compressed API response, PDF `FlateDecode` stream, or config value back into plain
  text.
- Verifying that a [deflate compress](/util/deflate_compress/) step elsewhere in a pipeline produced
  the bytes you expect, by round-tripping them.
- Recovering data from a raw DEFLATE fragment cut out of a larger binary format and pasted in as hex
  or Base64.
- Decompressing bytes captured as hex or Base64 text (from a debugger, a log line, or a network
  capture) without a separate decode pass.
- Checking what a zlib or pako deflate call produced, pasted from a console as hex or Base64, to
  confirm it used the wrapper the receiver expects.

## Tips and pitfalls

If the data is actually gzip (recognizable by its own two-byte magic number instead of a zlib header),
this tool tells you so directly with an "input looks like gzip data" error (unless you forced
`format: raw`) rather than failing silently; use [gzip decompress](/util/gzip_decompress/) for that format,
since gzip's header and trailer are laid out differently. `auto` is decided purely by the header bytes,
never by trying zlib and falling back to raw on failure: raw DEFLATE has no checksum of its own, so a
guess-and-check approach could "succeed" on the wrong interpretation and hand back garbage that merely
looks like valid output. If `output` is left at `text` and the decompressed bytes are not valid UTF-8,
the tool throws instead of returning corrupted characters. Switch to `bytes` for binary payloads such
as images or other compressed formats nested inside this one.
