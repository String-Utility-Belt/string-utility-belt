---
title: XML Escape Online: Encode Text for XML Documents
description: XML escape characters online: encode &, <, >, quotes and apostrophes as the five predefined entities, or non-ASCII characters as numeric references too.
---
## What does escaping text for XML mean?

XML reserves a handful of characters for its own syntax: `<` and `>` delimit tags, `&` starts an entity reference, and `"` and `'` delimit attribute values. Unlike HTML, XML has no large table of named entities built in. It defines exactly five: `&lt;`, `&gt;`, `&amp;`, `&quot;`, and `&apos;`. Any text you insert as element content or an attribute value has to have these characters escaped, or a parser will reject the document or misinterpret its structure. This tool escapes text using those five predefined entities, following the XML 1.0 rules exactly, and optionally widens the escaping to cover non-ASCII characters too.

## How it works

By default the tool escapes `&`, `<`, `>`, `"`, and `'` to their predefined entities:

```example
title: markup and quotes
input: <a href="x">Tom & Jerry's</a>
output: &lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&apos;s&lt;/a&gt;
```

Everything else, including accented letters and other non-ASCII text, is left as a literal character by default, since XML documents are usually UTF-8 and can carry it directly.

### Skipping quotes

If your text is only going into element content (not an attribute value), you may not need `"` and `'` escaped. Turning **escape quotes** off leaves them as literal characters and only escapes `&`, `<` and `>` (strictly, XML only requires `&` and `<` to be escaped in content, and `>` only inside the sequence `]]>`; escaping `>` everywhere is simply the safe choice):

```example
title: leaving quotes alone
params: {"quotes": false}
input: He said "hi" & it's <ok>
output: He said "hi" &amp; it's &lt;ok&gt;
```

### Escaping non-ASCII as numeric references

Setting **scope** to `non-ascii` additionally escapes every character above U+007F as a hex numeric reference (`&#xHEX;`), which is useful when the receiving system can't be trusted to preserve UTF-8, or when you want output restricted to plain ASCII:

```example
title: non-ASCII text becomes numeric references
params: {"scope": "non-ascii"}
input: café <tag>
output: caf&#xE9; &lt;tag&gt;
```

### Carriage returns get a numeric reference too

XML 1.0 requires parsers to normalize any literal carriage return (`\r`, including as part of `\r\n`) down to a single line feed before an application ever sees it. That means a bare `\r` in your source text would silently turn into `\n` the next time the document is parsed. So this tool always writes it as `&#xD;` instead, which is the only way to preserve it exactly:

```example
title: a bare carriage return becomes a numeric reference
input-encoding: hex
input: 0D
output: &#xD;
```

Tabs and newlines, by contrast, are left as literal characters, which is correct for element content. Inside an attribute value, though, an XML parser normalizes literal tabs and newlines to spaces, so multi-line text placed in an attribute comes back on one line.

## Options

- **escape quotes (" and ')**: boolean, default `true`. Turn off if the text is only used as element content, not an attribute value.
- **scope**: `minimal` (default) escapes only the characters unsafe in markup; `non-ascii` also escapes everything above U+007F as a numeric reference.

## What this tool refuses to escape

XML 1.0 defines a strict set of characters that are legal anywhere in a document (tab, LF, CR, and most of the Unicode range, but not most C0 control characters, lone surrogates, or U+FFFE/U+FFFF). A character outside that set has no legal representation in XML, not even as a numeric reference. So this tool throws an error naming the offending code point (for example, `U+0000 is not a legal XML 1.0 character and cannot be escaped`) rather than silently producing invalid output.

## Common uses

- Preparing user-supplied or database text for insertion into XML documents, RSS/Atom feeds, or SOAP payloads.
- Escaping values before writing them into XML attributes, where quotes and ampersands would otherwise break the document.
- Producing ASCII-safe XML for older systems or transports that mishandle non-ASCII bytes, using the non-ascii scope.
- Generating XML test fixtures where you want explicit, predictable numeric escaping instead of raw UTF-8 characters.

## Tips and pitfalls

- To reverse this encoding, or to remove escape characters from XML text you received, use [XML unescape](/util/xml_unescape/), which resolves the same five entities plus `&#decimal;` / `&#xHEX;` references.
- XML's entity set is a subset of HTML's. If you need the wider HTML named-entity table (`&eacute;`, `&copy;`, and about 270 others), use [HTML entity encode](/util/html_entity_encode/) instead; its named output is not valid XML without a DTD declaring those names.
- Because `&`, `<`, `>` and carriage returns are always escaped whatever the options, round-tripping through this tool and [XML unescape](/util/xml_unescape/) reproduces the original text exactly, including its original line endings.
- If your text is going into JSON instead of XML, use [JSON escape](/util/json_escape/). The escaping rules are unrelated.
