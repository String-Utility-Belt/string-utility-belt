---
title: Punycode Decoder: See What an xn-- Domain Really Says
description: Paste an xn-- domain to see the Unicode name it spells, like xn--mnchen-3ya.de → münchen.de, and spot look-alike phishing domains before you click.
---
## What is Punycode decoding?

[Punycode](https://www.rfc-editor.org/rfc/rfc3492) (RFC 3492) is the ASCII-safe encoding behind internationalized domain names: it lets `münchen.de` travel through DNS as `xn--mnchen-3ya.de`. This tool reverses that, turning the ASCII form back into readable Unicode text. It is the conversion a browser performs when it chooses to show a domain in its native script rather than as `xn--`. If you found an `xn--` domain in a link, an email or a log and want to know what it says, paste the whole domain: every encoded label is decoded and the rest is left as it is. [Punycode encode](/util/punycode_encode/) does the opposite direction.

## How it works

In the default **domain** mode, the input is split on `.`, and any label starting with the `xn--` prefix is decoded; labels without it are left alone, since they were never Punycode in the first place.

```example
title: a full internationalized domain
input: xn--mnchen-3ya.de
output: münchen.de
```

```example
title: a domain with only some labels encoded
input: xn--bcher-kva.example.com
output: bücher.example.com
```

The `xn--` prefix is matched case-insensitively, as DNS names are case-insensitive, but the literal ASCII portion of the label after the prefix keeps whatever case it was written in. Decoding `XN--MNCHEN-3ya` yields `MüNCHEN`, not `münchen`, because the bootstring's literal run (`MNCHEN`) is copied through as-is before the encoded suffix is applied.

### Label and raw modes

**label** mode decodes the whole input as a single label rather than splitting on dots. That is useful for a lone hostname component, or Punycode that is not part of a domain at all.

```example
title: label mode
params: {"mode": "label"}
input: xn--mnchen-3ya
output: münchen
```

**raw** mode expects bare RFC 3492 bootstring text with no `xn--` prefix, which is what the encoder's own raw mode produces.

```example
title: raw bootstring input
params: {"mode": "raw"}
input: 4can8av2009b
output: üëäö♥
```

## Options

- **mode**: `domain` (default, decode each `xn--` labeled part of a dot-separated domain), `label` (decode the whole input as one label) or `raw` (bare bootstring, no `xn--` handling).

## Common uses

- Reading what an `xn--`-prefixed domain you were given actually says in its original script.
- Verifying that a Punycode string produced elsewhere decodes to the expected text.
- Auditing suspicious `xn--` domains: decoding shows the name a phishing domain is dressed up as, such as Cyrillic letters posing as Latin ones.
- Testing IDNA and bootstring decoder implementations against known values.

## Tips and pitfalls

- Punycode decoding recovers the exact original text. It is a lossless, reversible encoding, not a hash or a cipher, so there is nothing to "crack."
- Malformed Punycode is rejected with a specific error rather than guessed at: an invalid digit character, a truncated sequence, an overflowed value, or a decoded result outside the valid Unicode range (including landing on a surrogate code point) each produce their own clear message.
- A decoded domain being unusual or containing look-alike characters is not itself proof of anything malicious, but it is worth a second look. Combine this with [unicode inspect](/util/unicode_inspect/) to see exactly which script and code points a decoded label actually contains.
- This tool only reverses RFC 3492; it does not apply the IDNA validity checks a browser does, so it will decode labels a browser would reject, for example `xn--abc-`, which decodes to plain `abc`.
- Re-encoding the result with [punycode encode](/util/punycode_encode/) returns the original string for a lower-case label produced by a standard encoder; if it comes back different, the label was not in canonical form.
