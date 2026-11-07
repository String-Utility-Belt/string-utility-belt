---
title: Indent XML Online: XML Formatter and Pretty Printer
description: Indent and pretty-print XML online with a configurable indent width. Comments, CDATA, processing instructions and the doctype stay intact.
---
## What is XML pretty printing?

Minified or machine-generated XML (a single long line straight out of an API response or a build tool) is hard to read and even harder to diff. This tool re-indents XML so that each element sits on its own line, nested according to the document's structure, the same job tools like `xmllint --format` or `tidy` do. Because it uses a hand-written tokenizer rather than a DOM parser, comments, CDATA sections, processing instructions and the doctype declaration all survive untouched instead of being dropped or rewritten.

## How it works

Starting from a minified document, each child element is placed on its own indented line, with the indent depth matching the nesting level:

```example
title: indents nested elements
input: <root><a>1</a><b/></root>
output: <root>
  <a>1</a>
  <b/>
</root>
```

An element that contains only text stays on one line rather than pushing the text onto its own line (`<a>1</a>`, not `<a>\n  1\n</a>`), since text-only elements read better compact. The same is true for "mixed content", where text sits alongside inline elements like `<b>`:

```example
title: mixed content stays on one line instead of reflowing words
input: <p>
  Hello <b>brave</b> world
</p>
output: <p>Hello <b>brave</b> world</p>
```

An empty element (no children and no text) can be written either as a self-closing tag or as an explicit open/close pair, controlled by the **collapse empty elements** option:

```example
title: collapsing empty elements to self-closing tags
params: {"collapseEmpty": true}
input: <a><b></b><c/></a>
output: <a>
  <b/>
  <c/>
</a>
```

Comments, processing instructions and the doctype declaration are copied through exactly as written, on their own line at the surrounding indent level. CDATA is copied verbatim too, but because it is character data it stays inline with its element's text instead of being moved onto a line of its own, since indenting around it would change its literal contents:

```example
title: comments, CDATA and the doctype survive untouched
input: <!DOCTYPE root SYSTEM "r.dtd"><root><!-- a comment --><data><![CDATA[<b> & </b>]]></data></root>
output: <!DOCTYPE root SYSTEM "r.dtd">
<root>
  <!-- a comment -->
  <data><![CDATA[<b> & </b>]]></data>
</root>
```

## Options

- **indent**: the number of spaces per nesting level, from 0 to 16. `0` puts every element on its own line with no leading spaces, useful for a line-based diff. The default is 2.
- **collapse empty elements**: when on (the default), an element with no children and no text renders as a self-closing tag (`<b/>`); when off, it renders as an explicit open/close pair (`<b></b>`).

## Common uses

- Making a minified SOAP response, RSS feed, or Android/Java resource file readable before editing it.
- Producing a stable, line-based diff of two XML documents by formatting both the same way first.
- Normalizing hand-written XML that mixes tabs, spaces and inconsistent indentation.

## Tips and pitfalls

- Attributes spread across multiple source lines are collapsed onto the tag's own line and normalized to single spaces between them.
- Text is tidied, not kept byte for byte: line breaks inside text become single spaces, leading and trailing whitespace in an element's text is trimmed (`<a>  x  </a>` becomes `<a>x</a>`), and whitespace-only text between elements is dropped, so `<b>a</b> <i>b</i>` loses the space between them. `xml:space="preserve"` is not honoured; skip this tool for whitespace-sensitive content.
- Running this tool on already-formatted XML is idempotent. It produces the same output again rather than drifting.
- Malformed XML (a mismatched or unclosed tag) raises a specific error rather than guessing at the intended structure. It is not a full validator, though: an unescaped `&` or an undeclared entity passes through unchanged. To go the opposite direction and collapse XML back onto one compact line, see [xml minify](/util/xml_minify/); to convert between XML and JSON, see [xml to json](/util/xml_to_json/) and [json to xml](/util/json_to_xml/).
