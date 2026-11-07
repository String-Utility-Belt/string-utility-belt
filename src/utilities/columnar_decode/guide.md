---
title: Columnar Transposition Cipher Decoder Online
description: Decrypt columnar transposition cipher text online with the key and padding it was encrypted with, plus what to try when the key is unknown.
---
## What does this tool decrypt?

This reverses [columnar transposition encode](/util/columnar_encode/): a cipher that keeps every letter of the message but reorders it by writing it into a grid and reading the grid back out column by column in the alphabetical order of a keyword. Give this tool the same key (and the same pad character) that produced the ciphertext, and it rebuilds the grid and reads it back out row by row to recover the original text.

## How it works

1. The key's letters are sorted alphabetically (case-insensitively) to recover the order the columns were read in when encoding. For `ZEBRA`, that's columns 4, 2, 1, 3, 0.
2. Because the grid is filled row by row but the ciphertext is read column by column, the tool first works out how many rows each column has: the text length may not divide evenly by the key length, so the leftmost columns can hold one extra character.
3. It walks the ciphertext back into those columns in the order from step 1, then reads the completed grid row by row to recover the plaintext.
4. If a pad character is set and the ciphertext fills the grid exactly (as padded output always does), trailing pad characters left over from encoding are stripped from the very end of the result, but never more than the key length minus one, since that's the most padding the encoder could have added.

```example
title: decode with the default key ZEBRA
input: EODAEASRENEIELORCEECWDVFT
output: WEAREDISCOVEREDFLEEATONCE
```

```example
title: stripping the X padding added by the encoder
params: {"key": "ZEBRA", "padChar": "X"}
input: OLXLOXEWXLRXH D
output: HELLO WORLD
```

When the encoder was run with an empty pad character (a ragged grid), decoding with an empty pad rebuilds it exactly, with nothing to strip:

```example
title: no padding to strip
params: {"key": "ZEBRA", "padChar": ""}
input: OLLOEWLRH D
output: HELLO WORLD
```

```example
title: a key with repeated letters (BANANA)
params: {"key": "BANANA", "padChar": "X"}
input: BHDJFLAGCIEK
output: ABCDEFGHIJKL
```

```example
title: empty input
input:
output:
```

## Options

- **key**: must match the key used to encode, case-insensitively. An empty key is rejected.
- **pad character**: must match what the encoder used. Set it to the same value (or leave both empty) that [columnar transposition encode](/util/columnar_encode/) used, or the trailing characters won't be stripped correctly.

## Common uses

- Recovering the original message from ciphertext produced by [columnar transposition encode](/util/columnar_encode/).
- Working through classical cryptography exercises and cipher-cracking puzzles that use columnar transposition.
- Verifying a columnar transposition implementation elsewhere by round-tripping known plaintext through both tools.

## Tips and pitfalls

- Getting the key wrong doesn't usually throw an error. It silently produces a different, garbled rearrangement, since any non-empty key is technically valid. Check the output for readability, not just the absence of an error.
- If the ciphertext was encoded with a padded grid, decoding it with an empty pad character (or vice versa) leaves stray pad characters in the output, or strips real trailing text. Pad settings must match exactly on both ends.
- Only trailing pad characters are ever removed, and never more of them than the key length allows, so decoding never accidentally eats real message text from the middle or the start.
- There is no solver for a message without the key, but the editor's branch step is a quick way to try several: give it one lane per candidate key, each running this step, and the merged output shows every candidate at once, so the readable one stands out. For a double columnar transposition, run the step twice, with the second key first.
