---
title: MessagePack Encoder: Encode JSON to MsgPack Online
description: Encode JSON to MessagePack binary online. See exactly how maps, arrays, integers, strings and floats are packed, with byte-level worked examples.
---
## What is MessagePack?

MessagePack is a binary serialization format that stores the same kinds of data as JSON (maps, arrays, strings, numbers, booleans and null), but as compact binary instead of text. It is used where JSON's parsing overhead and text size matter: RPC protocols, caches like Redis, game networking, and inter-service messages. Because it is schemaless like JSON (unlike Protocol Buffers, see [protobuf wire decode](/util/protobuf_decode/)), any JSON-shaped value can be encoded without writing a schema first. [msgpack decode](/util/msgpack_decode/) reverses this conversion.

## How it works

Every value is prefixed with a type byte that tells the decoder what follows and how long it is. For integers, strings, arrays and maps the encoder picks the smallest form that fits the value:

- A small non-negative integer (0–127) or small negative integer (-32 to -1) is packed as a single byte with no separate length prefix at all; larger integers escalate through 8-, 16-, 32- and 64-bit forms as needed.
- A non-integer number is always packed as an IEEE 754 float64 (see [ieee754](/util/ieee754/)), never float32, even when the value would fit in 32 bits.
- Strings are UTF-8 encoded first, then length-prefixed.
- Raw bytes handed over by a previous step (as opposed to text) are packed with a `bin` header, keeping them distinct from strings.
- Maps and arrays are length-prefixed, then contain their encoded elements in order.

```example
title: a two-field map, with keys shown in the byte/hex/utf8 breakdown
input-encoding: json
input: {"id":1,"name":"Ada"}
output: bytes[130, 162, 105, 100, 01, 164, 110, 97, 109, 101, 163, 65, 100, 97]
hex: [82, a2, 69, 64, 01, a4, 6e, 61, 6d, 65, a3, 41, 64, 61]
utf8: ��id␁�name�Ada
```

Here `82` is a fixmap header meaning "map with 2 pairs", `a2` means "string, 2 bytes" (the key `id`), `01` is the integer `1` packed as a single byte, `a4` means "string, 4 bytes" (`name`), and `a3` means "string, 3 bytes" (`Ada`). The `bytes[...]` line is the same data as plain decimal, and `hex:` as hexadecimal. The `utf8:` line decodes the same bytes as text, so header bytes that are not valid UTF-8 render as replacement characters.

```example
title: nil, booleans and an array pack to a single byte each element
input: [null, true, false]
output: bytes[147, 192, 195, 194]
hex: [93, c0, c3, c2]
utf8: ����
```

```example
title: astral unicode is encoded as a UTF-8 string
input: 😀
output: bytes[164, 240, 159, 152, 128]
hex: [a4, f0, 9f, 98, 80]
utf8: �😀
```

## Input handling

This step accepts a JSON value from a previous pipeline step, or a JSON string, which it parses before encoding. If the text is not valid JSON, it falls back to encoding it as a plain MessagePack string. So typing `hi` produces the 3-byte string encoding of `hi`, not an error. Empty input produces zero bytes.

## Common uses

- Preparing a compact payload for a cache (Redis, Memcached) or a message queue.
- Testing a MessagePack-based RPC client or server by hand-crafting a request.
- Comparing MessagePack's size against the JSON text for the same data.

## Tips and pitfalls

- JSON numbers are parsed as JavaScript doubles, so an integer beyond `Number.MAX_SAFE_INTEGER` (2^53 − 1) has already lost precision before encoding and is written as a float64, not as a 64-bit integer. Send IDs that large as strings.
- Circular object references cannot be encoded and raise a clear error rather than looping forever.
- To inspect existing MessagePack bytes instead of producing them, use [msgpack decode](/util/msgpack_decode/); to inspect raw bytes generically, [hex dump](/util/hex_dump/) is useful alongside this tool's own hex output.
