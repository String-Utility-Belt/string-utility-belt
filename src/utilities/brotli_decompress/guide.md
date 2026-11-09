---
title: Brotli Decompress Online: Decode .br Data to Text
description: Brotli decode online: decompress a .br stream in your browser to readable text or raw bytes, with worked examples covering Unicode and empty input.
---
## What is Brotli?

Brotli is a general-purpose compression format Google introduced in 2013, standardized as
[RFC 7932](https://www.rfc-editor.org/rfc/rfc7932). It combines a large, curated dictionary of common
web strings (HTML tags, JavaScript keywords, CSS properties) with context modeling and Huffman
coding, which typically lets it beat gzip and plain DEFLATE on text, especially small payloads,
where the shared dictionary does much of the work before the input even needs repeating patterns of
its own. Browsers negotiate it automatically for HTTP responses (`Content-Encoding: br`), and it also
shows up as standalone `.br` files next to a `.js` or `.css` asset in a static site's build output.

This tool decompresses a Brotli stream back to its original bytes. It does not compress: there is no
matching "brotli compress" utility here; only the Brotli decoder ships with this app. If you need to
produce a compressed stream in this app, use
[gzip compress](/util/gzip_compress/) or [deflate compress](/util/deflate_compress/) instead. Both are
widely supported and have full encode/decode pairs here.

## How it works

Decompression walks the stream's meta-blocks, whose commands insert literal bytes and copy earlier
output or entries from Brotli's built-in static dictionary, and reassembles them into the original
data. Brotli carries no integrity checksum (unlike gzip's CRC-32 or zlib's Adler-32). A truncated or
structurally broken stream fails with a "not valid brotli data" error, but a damaged byte that still
leaves a decodable stream can come out as silently wrong data, because there is nothing to check it against.

Once the raw bytes are recovered, the **output** option decides what you get back: `text` (the
default) decodes them as UTF-8, and `bytes` returns them untouched. Pick `bytes` whenever the
decompressed payload might not be text at all (an image, a font, or another format's binary header),
because `text` throws on bytes that are not valid UTF-8.

```example
title: decompress a brotli stream to text
input-encoding: hex
input: 1b1c00001ca9539f3b740d22f426a742e82a8dad06d1a784d56935bc01
params: {"output": "text"}
output: Hello, Brotli! Hello, Brotli!
```

Brotli decodes to exact bytes, not merely equivalent text, so accented letters and emoji survive
intact. They are just more UTF-8 bytes for the decoder to reproduce:

```example
title: unicode text round-trips exactly
input-encoding: base64
input: ixGAaMOpbGxvIHfDtnJsZCDigJQg8J+YgCDDvG7Dr2NvZGUg4pyTAw==
output: héllo wörld — 😀 ünïcode ✓
```

Empty input is treated as "nothing to decompress" rather than an error, so a pipeline that sometimes
receives an empty step output does not blow up on this step:

```example
title: empty input never throws
input:
output:
```

## Options

The only setting is **output**: `text` (default) or `bytes`. Leave it on `text` for HTML, CSS,
JavaScript, JSON, or any other Brotli-compressed text payload. Switch to `bytes` when the decompressed
result feeds a binary-aware step, such as [zip extract](/util/zip_extract/) on an embedded archive, or
when you plan to inspect the raw bytes with [hex dump](/util/hex_dump/).

## Common uses

- Inspecting a pre-compressed `.br` asset from a build pipeline or a raw `Content-Encoding: br`
  response body, to confirm what a server actually sends.
- Decoding a Brotli-compressed API response or log payload captured outside the browser, where the
  original decompression tooling is not on hand.
- Recovering the plain text or JSON body of a compressed fixture used in tests, without spinning up a
  script.
- Chaining after [hex decode](/util/hex_decode/), or [base64url decode](/util/base64url_decode/) with
  output set to `bytes`, when the compressed bytes were transported as text.
- Decompressing a `.br` file: open it through the editor's file input, which keeps the bytes intact,
  and set output to bytes when the content is not text.

## Tips and pitfalls

Feed this step actual bytes, or a "binary string" where each character's code is one byte (the kind
`atob()` produces), not a hex or Base64 string typed as plain text. Unlike
[gzip decompress](/util/gzip_decompress/) and [deflate decompress](/util/deflate_decompress/), this
utility does not try to auto-detect a hex or Base64 transport encoding in its text input; if your
compressed data arrives as one of those, decode it first with [hex decode](/util/hex_decode/) or
[base64url decode](/util/base64url_decode/) (it reads standard Base64 too; set its output to `bytes`)
and pipe the resulting bytes in here. Plain [base64 decode](/util/base64_decode/) will not do: it
decodes to UTF-8 text and throws on bytes that are not valid UTF-8, which compressed data almost never is.

If the decompressed payload is not valid UTF-8 and `output` is left at `text`, the tool throws a clear
error telling you to switch to `bytes` rather than emitting mangled characters. That is a deliberate
choice: silently replacing invalid bytes with placeholder characters would make a binary payload look
like it decoded correctly when it did not. A "not valid brotli data" error, on the other hand, usually
means the input was truncated, was never Brotli in the first place, or still needs a decode step (hex
or Base64) before it reaches this one.
