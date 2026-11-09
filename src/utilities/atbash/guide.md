---
title: Atbash Cipher Online: Encode & Decode Mirror Text
description: Decode Atbash cipher text or encode your own online: the mirror-alphabet substitution where A becomes Z and Z becomes A, the same step in both directions.
---
## What is the Atbash cipher?

Atbash is one of the oldest known substitution ciphers, originally used for the Hebrew alphabet and later adapted to Latin. The rule is simple: reverse the alphabet. The first letter swaps with the last, the second with the second-to-last, and so on: `A` becomes `Z`, `B` becomes `Y`, `M` becomes `N`. There is no key to choose or remember, which makes it easy to use but also trivial to break; it offers no real security and is best thought of as a puzzle or teaching cipher rather than a way to protect anything.

## How it works

The tool walks through your text one character at a time:

- Uppercase letters `A`–`Z` are mapped to their mirror position in the uppercase alphabet.
- Lowercase letters `a`–`z` are mapped to their mirror position in the lowercase alphabet, so case is always preserved.
- Anything else (digits, punctuation, spaces, accented letters, emoji) passes through completely unchanged.

Because the mapping is symmetric (mirroring twice gets you back to the start), encoding and decoding are the same operation: running a piece of Atbash text back through this tool restores the original.

```example
title: a classic phrase
input: Attack at Dawn
output: Zggzxp zg Wzdm
```

```example
title: mixed case and punctuation
input: Hello, World!
output: Svool, Dliow!
```

```example
title: digits and punctuation are left alone
input: 123 !?-
output: 123 !?-
```

```example
title: non-latin characters and emoji pass through untouched
input: héllo 😀 Ω
output: séool 😀 Ω
```

```example
title: empty input
input:
output:
```

## Common uses

- Classroom demonstrations of substitution ciphers and cryptanalysis basics (frequency analysis breaks Atbash instantly, since letter frequencies are just mirrored).
- Puzzle hunts, escape rooms, and games that want a simple, self-inverse text scramble.
- A quick way to obscure a spoiler or answer in plain text without any real secrecy.

## Tips and pitfalls

- Atbash has no key and is not encryption in any meaningful sense. Anyone who recognizes the pattern (or runs frequency analysis) can read it immediately. Never use it to protect anything sensitive.
- Only ASCII letters are mirrored. Accented letters like `é` and non-Latin scripts are passed through untouched, since the mapping only covers `A`–`Z` and `a`–`z`.
- Because encoding and decoding are identical, there's a single Atbash tool rather than separate encode/decode utilities. Apply it once to scramble, apply it again to restore.
- For a cipher with an adjustable amount of scrambling, see [caesar / rot-n](/util/caesar/), which shifts letters by a chosen amount instead of a fixed mirror. For a keyed substitution that is stronger but still breakable by hand, try [vigenère encode](/util/vigenere_encode/).
