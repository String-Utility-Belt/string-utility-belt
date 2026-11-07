---
title: Bulk UTM Builder: Tag a List of URLs at Once
description: A bulk UTM generator: add utm_source, utm_medium and utm_campaign to many links at once, with old tags replaced, ? or & picked per URL and #anchors kept.
---

## Why pasting ?utm_source on the end breaks some links

UTM tags are ordinary query parameters that analytics tools read when someone arrives through a link: `utm_source` names where the visit came from (newsletter), `utm_medium` the kind of channel (email) and `utm_campaign` the campaign, plus `utm_content`, `utm_term` and a few others. The quick way to tag the thirty links in a newsletter is to append the same `?utm_source=…` string to every row, which is right only for a link with no query, no anchor and no old tags:

- `/blog/post?ref=nav` becomes `/blog/post?ref=nav?utm_source=newsletter&…`. The query starts at the first `?` and a later one is just part of a value, so `ref` becomes `nav?utm_source=newsletter` and there is no `utm_source` at all.
- `/webinar#register` becomes `/webinar#register?utm_source=…`. Everything after `#` is the fragment, which the browser keeps to itself ([RFC 3986, section 3.5](https://www.rfc-editor.org/rfc/rfc3986#section-3.5)): the tags never reach the server, a query-string parser finds none, and the page no longer scrolls to the register section, because no element has that longer id.
- Picking `&` for links that already have a query fixes the first problem but not the old tags: a link copied from last month's email keeps them and gains a second `utm_source`. Which one counts depends on the code reading it. JavaScript's `URLSearchParams.get()` returns the first, while a dict built from Python's `parse_qsl` keeps the last.

## Why the steps run in this order

A bulk UTM generator has to get all three cases right, which is why this is a chain of steps rather than one find-and-replace. [extract matches](/util/extract_preset/) comes first so that every later step sees one link per line, whether you pasted a list, spreadsheet rows copied on Windows, a paragraph of text or HTML.

The second step removes the old `utm_` pairs, one link at a time. [unescape HTML](/util/unescape_html/) first turns `&amp;` back into `&`: HTML source usually writes the ampersands in an href that way, and a query parser would read `amp;utm_medium` as a single name. It decodes only the handful of escapes HTML requires, so a parameter such as `&region=` is left alone, where a full entity decoder would read `&reg` as ®. Then [normalize query params](/util/query_params_normalize/) drops every parameter whose name matches `utm_*`, in any capitalization, along with the `?` or `&` it leaves behind. Its sorting, deduplicating and lowercasing options are switched off, so the parameters you keep stay in their order and spelling. Its drop list takes more names, separated by commas: add `fbclid,gclid` to remove those click ids too. [deduplicate lines](/util/line_dedupe/) has to come after this step: until the old tags are gone, `/pricing` and `/pricing?utm_campaign=summer_2026` look like two different links, and you would get the same tagged link twice.

The [sed script](/util/sed/) writes a `{utm}` placeholder rather than the tags themselves. It adds `&{utm}` when a `?` appears before any `#` and `?{utm}` otherwise, always in front of the fragment. Hash-routed app links such as `/#/settings?tab=billing` work the same way: the `?` inside the route does not count, and the tags go into the real query in front of it.

[multi replace](/util/multi_replace/) then fills the placeholder from a small table whose rows run top to bottom: the first turns `{utm}` into three pairs, the rest fill in your values. That keeps the values in one place instead of in both lines of the sed script. To add `utm_content`, extend the first row with `&utm_content={content}` and add a `{content}` row below it.

## What it does not handle

Every link gets the same tags. For several channels, run the list once per channel; for a different `utm_content` on each link in one email, edit those lines afterwards. Values go in exactly as you type them, without percent-encoding: a space cuts the link short wherever plain text is turned into links automatically, `&` starts a new pair and `#` starts the fragment. Stick to lowercase words joined with underscores or hyphens, and keep one spelling per value, since a report that groups by exact text lists `Newsletter` and `newsletter` as two sources.

The output is the list of tagged links, not your draft with the links swapped in. A bare `example.com/page`, with neither a scheme nor www., is not found. A www. link comes back without https://, and one with nothing between the domain and its `?` or `#`, such as `www.example.com?ref=footer`, loses everything from there on, so paste full links where you can. Commas are legal inside a URL, so in a CSV file a column after the URL is read as part of the link: copy the cells from the spreadsheet instead, which pastes them separated by tabs. From a whole HTML template you also get every other URL in it, such as images and stylesheets, tagged like the rest: paste only the part with the links, or delete those lines afterwards. Old `utm_` pairs are removed from the real query only: a tag after the `#`, as in `/#/signup?utm_source=partner`, stays where it is. GA4 and most analytics tools read campaign tags only from the query, so a leftover tag in the fragment is not counted, but delete it by hand if it should not be there.

Nothing here checks that a link works. If it redirects, as short links do, the tags survive only when the redirect keeps the query string, so open one tagged link before you send.

## Doing it in a spreadsheet or a script

In Excel or Google Sheets, `=A2 & IF(ISNUMBER(FIND("?", A2)), "&", "?") & "utm_source=newsletter&utm_medium=email&utm_campaign=fall_sale_2026"` picks `?` or `&` for ordinary links (FIND, because Excel's SEARCH treats `?` as a wildcard), but still puts the tags after a `#` and keeps the old ones.

In Python, `urllib.parse` handles the query and the fragment properly and percent-encodes the values for you:

```python
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode

TAGS = [("utm_source", "newsletter"), ("utm_medium", "email"), ("utm_campaign", "fall_sale_2026")]

def tag(url):
    parts = urlsplit(url)
    kept = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True)
            if not k.lower().startswith("utm_")]
    return urlunsplit(parts._replace(query=urlencode(kept + TAGS)))
```

It re-encodes the parameters it keeps, though: `%20` comes back as `+`, a `/` in a value as `%2F`, and a bare key such as `?preview` as `?preview=`. Servers usually read both forms alike, but the preset above changes only the `utm_` pairs and the separators around them.
