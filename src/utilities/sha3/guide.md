---
title: Keccak-256 & SHA-3 Hash Generator Online
description: Compute Keccak-256, the hash Ethereum uses, or SHA-3 digests at 224, 256, 384 or 512 bits online, from text or bytes.
---
## What is SHA-3?

SHA-3 is the newest member of the Secure Hash Algorithm family, standardized by NIST in FIPS 202 in 2015. Unlike SHA-1 and SHA-2 (see [hash](/util/hash/)), which share a common Merkle–Damgård construction, SHA-3 is built on a completely different design called Keccak, based on a "sponge" construction. NIST ran the SHA-3 competition to get an alternative that doesn't share SHA-2's design, in case attacks like those that broke MD5 and SHA-1 ever carried over to SHA-2, which remains secure today. A practical difference: SHA-3 is not vulnerable to the length-extension attacks that affect SHA-256 and SHA-512. The original Keccak submission and the standardized SHA-3 differ only in one internal padding detail, so both are offered here at the same four widths.

## How it works

Your text (as UTF-8 bytes) or raw bytes are absorbed into the Keccak sponge and squeezed out as a digest of the width you choose (224, 256, 384, or 512 bits), then shown as hex, base64, or unpadded URL-safe base64.

```example
title: SHA3-256 of "hello"
params: {"algorithm": "SHA3-256", "output": "hex"}
input: hello
output: 3338be694f50c5f338814986cdf0686453a888b84f424d792af4b9202398f392
```

```example
title: Keccak-256, the variant Ethereum uses
params: {"algorithm": "Keccak-256", "output": "hex"}
input: hello
output: 1c8aff950685c2ed4bc3174f3472287b56d9517b9c948127319a09a7a36deac8
```

```example
title: base64 output instead of hex
params: {"algorithm": "SHA3-256", "output": "base64"}
input: abc
output: Ophdp0/iJbIEXBcta9OQvYVfCG4+nVJbRr/iRRFDFTI=
```

```example
title: empty input
input:
output:
```

## Options

- **algorithm**: `SHA3-224`, `SHA3-256` (default), `SHA3-384`, `SHA3-512`, or their `Keccak-224`/`256`/`384`/`512` counterparts. SHA-3 and Keccak at the same width produce different digests for the same input. They are not interchangeable, only structurally related.
- **output**: `hex` (default), `base64`, or `base64url` (unpadded, safe to put directly in a URL).

## Common uses

- **Keccak-256** specifically: computing Ethereum addresses, transaction hashes, and function selectors, all of which use this exact variant rather than standardized SHA3-256.
- General-purpose fingerprinting and integrity checks where you want a hash from a different mathematical foundation than SHA-2, for defense-in-depth or protocol requirements that specify SHA-3.
- Cryptography education: SHA-3's sponge construction is a good contrast to the more common Merkle–Damgård designs (MD5, SHA-1, SHA-2).

## Tips and pitfalls

- **Don't mix up SHA-3 and Keccak.** They share an algorithm family and this tool's parameter list, but "Keccak-256" and "SHA3-256" of the same input are different digests, as the two examples above show. If you're working with Ethereum or an older Keccak-based system, you almost certainly want the `Keccak-*` options, not `SHA3-*`.
- Neither SHA-3 nor Keccak is designed for password hashing. Like SHA-2, they're fast, which is a liability against brute-force attacks on short secrets. Use [bcrypt hash](/util/bcrypt_hash/), [argon2 hash](/util/argon2_hash/), or [pbkdf2](/util/pbkdf2/) for passwords instead.
- Empty input produces an empty result, not the SHA-3 digest of the empty string, so don't compare it against published empty-message test vectors.
- Base64url output is unpadded and swaps `+`/`/` for `-`/`_`, matching the encoding JWTs and URLs expect; see [base64url encode](/util/base64url_encode/) for that encoding on its own.
- For the older SHA-1/SHA-2 family, see [hash](/util/hash/); for BLAKE2/BLAKE3, a different modern hash family with generally faster software performance, see [blake](/util/blake/).
