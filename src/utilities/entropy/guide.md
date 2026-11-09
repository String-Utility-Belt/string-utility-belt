---
title: Password Entropy Calculator: Shannon Entropy Online
description: Shannon entropy calculator for any string: bits per character and in total, plus a length × charset password-strength score and crack-time estimate, online.
---
## What is entropy, and what is password entropy?

Entropy measures how unpredictable a string is, in bits. This tool reports two different numbers that are
easy to confuse:

- **Shannon entropy** looks only at the characters actually present and how often each one repeats. A
  string made of one repeated character has zero Shannon entropy, because once you've seen the first
  character you already know every other one.
- **Password entropy** ignores which characters you actually typed. It only looks at which *kinds* of
  character appear (lowercase letters, digits, symbols, and so on) and computes
  `length × log2(charsetSize)`: the entropy the string *would* have if every character had been picked uniformly at random
  from those classes. This is the textbook "pool size × length" formula behind many simple strength
  meters, and it is what the strength rating, crack-time estimate, and guess count on this page are based
  on.

## How it works

The tool walks the input by Unicode code point (so emoji and other multi-byte characters count once, not
per UTF-16 unit), works out the character classes present, and reports both entropy figures together:

```example
title: a short alphanumeric password
input: password123
output:
{
  "unit": "bits",
  "length": 11,
  "uniqueCharacters": 10,
  "entropyPerCharacter": 3.28,
  "totalEntropy": 36.05,
  "charsetSize": 36,
  "charsetClasses": [
    "lowercase",
    "digits"
  ],
  "passwordEntropy": 56.87,
  "passwordEntropyBits": 56.87,
  "strength": "reasonable",
  "guessesLog10": 17.12,
  "crackTime": "3 months"
}
```

`charsetSize` is built from which character classes are present: 26 for lowercase, 26 for uppercase, 10
for digits, 1 for a literal space, 32 for other printable punctuation, plus the exact number of distinct
control or non-ASCII characters seen (a conservative floor for characters outside the ASCII printable
range). `passwordEntropy` is then `length × log2(charsetSize)`, and `strength` and `crackTime` are derived
from that number, not from `entropyPerCharacter`.

That distinction matters: a string like `aaaaaa` has an `entropyPerCharacter` and `totalEntropy` of exactly
0 (it is maximally predictable), yet its `passwordEntropy` is still 28.2 bits (6 × log2 26), because the
calculation only knows the string is six lowercase letters. It has no idea the letters are all the same
one, so it rates it "weak" rather than "very weak". Shannon entropy would catch the repetition; password
entropy, by design, does not:

```example
title: a repeated character has zero Shannon entropy but non-zero password entropy
input: aaaaaa
output:
{
  "unit": "bits",
  "length": 6,
  "uniqueCharacters": 1,
  "entropyPerCharacter": 0,
  "totalEntropy": 0,
  "charsetSize": 26,
  "charsetClasses": [
    "lowercase"
  ],
  "passwordEntropy": 28.2,
  "passwordEntropyBits": 28.2,
  "strength": "weak",
  "guessesLog10": 8.49,
  "crackTime": "instant"
}
```

Setting **output format** to `text` renders the same numbers as a short plain-text report instead of JSON:

```example
title: a passphrase as a text report
input: correct horse battery staple
params: {"format": "text"}
output:
entropy:                3.49 bits/char
total entropy:          97.85 bits
length:                 28 characters
unique characters:      13
charset size:           27 (lowercase, space)
password entropy:       133.14 bits
strength:               very strong
est. crack time:        1.9e+22 years
```

## Options

- **unit**: `bits` (default) or `nats`. Switches every entropy figure between the two units;
  `passwordEntropyBits` and the strength rating always stay in bits regardless of this setting, since the
  strength ladder and crack-time estimate are defined in bits.
- **output format**: `json` (default, a structured report) or `text` (the same numbers as a short
  readable report, shown above).

## Crack-time assumptions

The crack-time figure is back-of-the-envelope arithmetic, not a security assessment. It takes the password
entropy above (so it assumes the string was generated at random from its character classes), assumes an
attacker searching half of that keyspace on average, and divides by a fixed 10 billion (10¹⁰) guesses per
second, which is roughly a fast, unthrottled offline attack against a fast, unsalted hash. Real attackers try
dictionary words, common patterns and leaked passwords first, so a human-chosen password like
`password123` falls in moments, not the "3 months" shown above. The fixed rate also ignores online
rate-limiting and slow password hashes such as bcrypt or Argon2, which change the effective
guesses-per-second by many orders of magnitude.

## Common uses

- Getting a quick length × charset figure for a random password or API key produced by
  [password generator](/util/password_generator/) or [random string](/util/random_string/). For truly
  random character strings, that figure is a fair approximation.
- Measuring how evenly characters are distributed in a string (Shannon entropy per character), for
  example to spot low-variety or repetitive data.
- Comparing the character-class diversity of two candidate secrets at a glance via `charsetClasses`.

## Tips and pitfalls

- This is not a real-world password strength checker. It has no idea what a dictionary word, a keyboard
  pattern, or a previously breached password looks like. `password1` and an equally long random string
  from the same character classes get the same password-entropy score, even though a real attacker would
  guess the former almost immediately with a wordlist.
- Because password entropy is derived only from length and character-class membership, adding one
  unnecessary symbol to an otherwise weak password raises the reported number without necessarily making
  the password meaningfully harder to guess in practice.
- Passphrases are badly overestimated: "correct horse battery staple" scores 133 bits above because it
  is treated as 28 random characters, but four words picked at random from a 2,048-word list carry only
  44 bits (4 × 11).
- Treat this tool as a rough, class-based upper bound on strength, not as the final word on whether a
  password is safe to use.
