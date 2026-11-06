---
title: Pronounceable Password Generator: Random & Passphrase Modes
description: Generate pronounceable passwords, strong random passwords or word-based passphrases online, with character-class and ambiguous-character controls.
---
## What is a password generator?

A password generator produces strings that are hard to guess and impractical to brute-force, without relying on a human to invent one. That matters because people are reliably bad at making up random-looking text, and tend to reuse patterns an attacker can exploit. This tool covers three different styles of output: fully random characters (the strongest per character typed), pronounceable syllable-based passwords (easier to read aloud or type once, at the cost of some randomness), and multi-word passphrases in the style popularized by [Diceware](https://en.wikipedia.org/wiki/Diceware) (easier to memorize, since a handful of ordinary words is often easier to recall than an equal-length jumble of symbols).

## How it works

In **random** mode (the default), the generator guarantees at least one character from every enabled character class, fills the rest from the combined pool, and shuffles the result so the guaranteed characters are not predictably placed at the start:

```example
title: a random password with a fixed seed (for reproducible documentation)
input:
params: {"mode": "random", "length": 16, "seed": 42}
output: nm7U=L&9*MvKtqHs
```

**Pronounceable** mode instead alternates consonants and vowels into syllables (occasionally adding an extra consonant), which produces something closer to a nonsense word than a random string, capitalizes one letter if uppercase is on, then appends a digit and a symbol if those classes are enabled:

```example
title: a pronounceable password
input:
params: {"mode": "pronounceable", "length": 14, "seed": 42}
output: Peragimasemr9!
```

**Passphrase** mode picks whole words from an embedded list of 264 short English words, capitalizes them if uppercase is on, appends a digit to one randomly chosen word, joins everything with the separator, and appends a trailing symbol (the digit and symbol only when those classes are on):

```example
title: a four-word passphrase
input:
params: {"mode": "passphrase", "words": 4, "seed": 42}
output: Coyote6-Chase-Errand-Dance%
```

## Options

- **mode**: `random` (default), `pronounceable`, or `passphrase`, as shown above.
- **length**: the total character count for `random` and `pronounceable` modes; default `20`, from 1 to 4096. In `random` mode it must be at least the number of enabled character classes, since each one needs a guaranteed character; in `pronounceable` mode it must be longer than the number of appended extras (one each for digits and symbols).
- **words**: how many words to use in `passphrase` mode; default `4`, from 1 to 64.
- **separator**: the string placed between words in `passphrase` mode; default `-`.
- **uppercase / digits / symbols**: character-class toggles, all on by default. In `random` mode, lowercase letters are always included and cannot be turned off; toggling these three controls which other classes join the pool. In `passphrase` mode, `uppercase` capitalizes each word, `digits` appends one digit to a random word, and `symbols` appends one trailing symbol.
- **exclude ambiguous**: on by default; drops easily-confused glyphs (the letters and digits `I l 1 O 0 o B 8 S 5 Z 2`, plus the punctuation `~ , ; : . /` and the bracket pairs `()`, `[]`, `{}`) from every pool, which matters when a password might be read off a screen or written down by hand. It also shrinks the pools (digits drop to five), so each character carries a little less randomness.
- **count**: how many passwords to generate at once, one per line; default `1`, up to 1000.
- **seed (0 = crypto random)**: leave at `0` for a fresh, unpredictable password from the browser's cryptographic random number generator on every run. Any other integer reproduces the exact same output every time, which is what makes the examples on this page deterministic. Never use a non-zero seed for a password you intend to actually use.

## Common uses

- Generating a new account password or a temporary password to hand to a user.
- Generating a memorable passphrase for something you have to type by hand, with enough words for the job (see the tips below).
- Supplying the password for a test account while [fake data](/util/fake_data/) fills in the name, email, and other fields.

## Tips and pitfalls

- Random mode with all four classes enabled and a reasonable length (16+ characters) is the strongest option per character; passphrases need more total characters to reach equivalent unpredictability, but are far easier for a person to type or remember.
- The passphrase list is much smaller than Diceware's 7,776 words, so each word adds only about 8 bits of randomness (a Diceware word adds about 12.9). The default four words plus digit and symbol come to roughly 40 bits, which is too few for a master password. Use eight or more words for anything important.
- Pronounceable mode trades a lot of randomness for readability: its syllable pattern means each character carries far fewer bits than in random mode, so make it longer.
- This tool ignores its input entirely. The input box has no effect on the generated password.
- To hash the password this tool produces before storing it, see [bcrypt hash](/util/bcrypt_hash/) or [argon2 hash](/util/argon2_hash/).
- For a token or identifier rather than a human-facing password, [random string](/util/random_string/), [nanoid](/util/nanoid/), or [uuid](/util/uuid/) are better suited. They are not designed around memorability or pronounceability.
