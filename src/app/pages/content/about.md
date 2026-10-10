---
title: About String Utility Belt — Free Browser-Based Text Tools
description: String Utility Belt is a free collection of text and string tools that run in your browser. Use one tool at a time, or chain them into pipelines with live previews.
---

# About String Utility Belt

String Utility Belt is a free collection of online text and string tools: Base64 and URL encoding, hashes and checksums, JSON, YAML, CSV and XML conversion, case changes, line sorting, regular expressions, generators and much more. You can use each tool on its own page, or chain several into a pipeline and watch every step's output update as you type.

## Why it exists

Most online converters do one thing per page, and many send your text to a server to do it. Real tasks usually take several steps (decode a JWT, pretty-print the JSON inside it, pull out one field), and the text is often something you would rather not upload. String Utility Belt was built around three ideas:

- **Your data stays with you.** Every transformation runs in your browser, on your device. Your input is never uploaded to be processed; the [privacy policy](/privacy/) lists the two optional features that do contact our server. The site sets no cookies and runs no tracking scripts: Cloudflare Web Analytics counts page views without cookies or identifiers, our server counts clicks on sponsor and tool links by id alone, neither ever receives what you paste, and the site blocks scripts from anywhere else.
- **Steps chain together.** Build a pipeline from any number of steps, see a preview after each one, reorder or disable steps, and share the whole pipeline as a link.
- **Every tool explains itself.** Each utility has its own page with a guide to how it works, worked examples, its options and a live playground.

## What you can do with it

- **Encode and decode:** Base64, Base32, Base58, hex, URL encoding, HTML entities, Unicode escapes, Morse code, Punycode and more.
- **Hash and check:** MD5, SHA-1, SHA-2, SHA-3, BLAKE, HMAC, bcrypt, Argon2 and checksums.
- **Convert data formats:** JSON, YAML, TOML, CSV, XML, INI, .env and query strings, plus formatting, minifying and validating.
- **Work with text and lines:** change case, sort and deduplicate lines, find and replace, wrap, trim, pad, compare two texts and count words.
- **Generate:** UUIDs, ULIDs, passwords, random strings, lorem ipsum, fake data and QR codes.
- **Developer helpers:** JWT decoding, regex explanations, cron descriptions, cURL conversion, timestamps, number bases and colours.

Browse [every utility by category](/utilities/), or start building a pipeline on the [home page](/).

## Beyond the browser

The same utilities run in your editor, your terminal and your AI assistant: a [VS Code extension](https://marketplace.visualstudio.com/items?itemName=stringutilitybelt.string-utility-belt) (also on [Open VSX](https://open-vsx.org/extension/stringutilitybelt/string-utility-belt) for Cursor and VSCodium), the [subelt command-line tool](https://www.npmjs.com/package/subelt), an [MCP server for AI agents](https://smithery.ai/servers/string-utility-belt/string-utility-belt) and a [Node.js library](https://www.npmjs.com/package/@string-utility-belt/core). See [integrations](/integrations/) for how to install each one.

## Accurate by design

Every worked example on this site, on each utility's page and in its guide, is run automatically as a test against the real code, so the output you see is what the tool actually produces.

## How the site is funded

String Utility Belt is free to use and has no paid tier. It accepts sponsorship on its own terms: a sponsor's message is clearly labelled and sits beside a page's content. It never appears inside the tool, the extensions, the command-line tool or the MCP server, and it never comes with a tracking script. Sponsors never see what you type, and never change how the tools work or what they do with your data. See [advertising](/advertise/) to sponsor the site.

If String Utility Belt saves you time, you can also support its development directly through [GitHub Sponsors](https://github.com/sponsors/Murraylr). It pays for hosting and keeps new utilities, presets and fixes coming.

## Get in touch

Found a bug, want a new utility, or have a question? See the [contact page](/contact/).
