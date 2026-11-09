---
title: MAC Address Formatter: Colon, Dash and Cisco Style
description: MAC address format converter: rewrite addresses in colon, dash, dot, bare or Cisco style, in bulk one per line, and check the OUI and multicast bits online.
---
## What is a MAC address?

A MAC (Media Access Control) address identifies a network interface (a NIC, a Wi-Fi radio, a virtual adapter) as 48 bits (EUI-48), or occasionally 64 (EUI-64), usually written as hex digit pairs separated by colons or dashes. Different tools and vendors write the same address differently: `00:1a:2b:3c:4d:5e`, `00-1A-2B-3C-4D-5E`, or Cisco's `001a.2b3c.4d5e`. This tool reformats between those styles and can break an address down into its OUI, its administrative bits, and whether it's a broadcast address.

## How it works

Paste a MAC address in any common separator style (colon, dash, dot, space, underscore, a bare run of hex digits, or `0x`-prefixed) and pick the output `style`:

```example
title: reformat as dash-separated, upper case
input: 00:1a:2b:3c:4d:5e
params: {"style": "dash", "case": "upper"}
output: 00-1A-2B-3C-4D-5E
```

```example
title: cisco style groups four hex digits at a time
input: 00-1A-2B-3C-4D-5E
params: {"style": "cisco"}
output: 001a.2b3c.4d5e
```

Turn on `info` to get a structured breakdown instead of a reformatted address: the OUI (the first 3 bytes, identifying the manufacturer), the NIC-specific remainder, the bit width, two flags read from the first octet, and a broadcast flag:

```example
title: address breakdown
input: 00:1a:2b:3c:4d:5e
params: {"info": true}
output:
{
  "address": "00:1a:2b:3c:4d:5e",
  "bare": "001a2b3c4d5e",
  "oui": "00:1a:2b",
  "nic": "3c:4d:5e",
  "bits": 48,
  "isMulticast": false,
  "isLocallyAdministered": false,
  "isBroadcast": false,
  "valid": true
}
```

`isMulticast` reads the least-significant bit of the first octet (the individual/group bit: 0 means one specific interface, 1 means a multicast or broadcast group), and `isLocallyAdministered` reads the next bit up (the universal/local bit: 0 means the address was assigned by the manufacturer from its OUI, 1 means it was set locally, as privacy-randomized Wi-Fi addresses, Docker containers and some hypervisors, such as QEMU/KVM with its `52:54:00` prefix, do):

```example
title: the second bit of the first octet marks a locally administered address
input: 02:00:00:00:00:01
params: {"info": true}
output:
{
  "address": "02:00:00:00:00:01",
  "bare": "020000000001",
  "oui": "02:00:00",
  "nic": "00:00:01",
  "bits": 48,
  "isMulticast": false,
  "isLocallyAdministered": true,
  "isBroadcast": false,
  "valid": true
}
```

The reserved all-ones address is the broadcast address, which is also technically a multicast address (its lowest bit is 1) as well as locally administered (every bit is 1):

```example
title: the broadcast address sets every relevant bit
input: ff:ff:ff:ff:ff:ff
params: {"info": true}
output:
{
  "address": "ff:ff:ff:ff:ff:ff",
  "bare": "ffffffffffff",
  "oui": "ff:ff:ff",
  "nic": "ff:ff:ff",
  "bits": 48,
  "isMulticast": true,
  "isLocallyAdministered": true,
  "isBroadcast": true,
  "valid": true
}
```

64-bit EUI-64 addresses (16 hex digits, used by some IPv6 interface identifiers and IoT hardware) are recognized too: the OUI is still the first 3 bytes, the NIC portion grows to 5 bytes, and `bits` reports 64.

## Options

- **style**: `colon` (default), `dash`, `dot`, `bare` (no separator), or `cisco` (four hex digits per group, dot-separated).
- **case**: `lower` (default) or `upper`.
- **per line**: on by default, formatting each line independently.
- **validate**: on by default; an unparsable line throws a clear error. Turn it off to pass invalid lines through unchanged instead.
- **show details**: returns the OUI/bit breakdown object described above instead of a reformatted string. Multiple input lines become an array of these objects.

## Common uses

- Normalizing MAC addresses in bulk from different log sources (some colon-separated, some Cisco-style) into one consistent format, one address per line, straight from a spreadsheet column.
- Checking whether an address is locally administered. That is a strong signal it's a virtual NIC, container interface, or a privacy-randomized address rather than genuine factory hardware.
- Pulling out a device's OUI (the first three bytes) to look up its manufacturer in the IEEE registry. This is meaningful only when the locally-administered bit is 0.
- Validating a batch of MAC addresses and flagging the malformed ones.

## Tips and pitfalls

- An address must be exactly 12 hex digits (EUI-48) or 16 (EUI-64) once separators are stripped; anything else throws when `validate` is on, naming the offending line.
- `33:33:` is the prefix IPv6 uses for multicast addresses mapped onto Ethernet. Such an address has both the multicast and locally-administered bits set, which is expected, not a sign of a malformed address.
- With `validate` off, a line that isn't a recognizable MAC address passes through unchanged (or, in `info` mode, comes back as `{ valid: false }`) instead of stopping the whole batch.
