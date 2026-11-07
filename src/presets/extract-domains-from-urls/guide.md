---
title: Extract the Domain From Each URL in a List
description: Paste a column of links and get the hostname of each on the same row, lowercased and without www., with or without https://, ports and paths removed.
---

## Getting the site out of a list of links

A backlink export, a crawl report or a column of referrers usually needs one thing from each URL: which site it points to. With a short, tidy list a spreadsheet formula does the job, for example `=REGEXEXTRACT(A2, "^(?:https?://)?(?:www\.)?([^/:?#]+)")` in Google Sheets. Real columns are less tidy. Some links start with `https://`, some with `http://` and a port, some with only `www.` or a bare domain. Some carry a user name before an `@`, some are wrapped in quotes from a CSV file, some have a second column pasted after them, and some hosts are in capitals or are IPv6 addresses in brackets. Each of those needs another case in the pattern.

This preset reads each line with the same URL rules browsers use, so those cases come out right without a pattern to maintain, and it keeps one output line per input line so the result pastes back next to the column it came from.

## What each step does

The first step runs on each line on its own. A [replace](/util/replace/) keeps the first link on the line: leading spaces, quotes and brackets go, and so does everything from the first space, tab, comma, quote or closing bracket on, which drops a second column or the rest of a CSV row. [Prefix / suffix lines](/util/line_affix/) adds `https://` when the line has no scheme of its own, because a URL parser reads `www.example.com/about` without one as a relative path, not a host. [Parse URL](/util/url_parse/) then splits the link into its parts with the browser's rules, which lowercase the host and set aside a port, a user name and password, the path, query and fragment. A [jsonpath query](/util/jsonpath/) keeps only `$.hostname`. A line that cannot be parsed becomes an empty line, so the rows still line up.

The last step removes a leading `www.` from every hostname, so `www.example.com` and `example.com` count as one site. Other subdomains, such as `shop.` or `blog.`, are kept.

## A hostname, not the registrable domain

The result is the full hostname: `shop.example.co.uk` stays `shop.example.co.uk`. Reducing it to the part a company registers, `example.co.uk`, needs the Public Suffix List, which knows that `co.uk` is a suffix like `com`. There is no Public Suffix List utility here. In Python, the `tldextract` package does it; in a spreadsheet, a formula that keeps the last two labels gets most `.com` and `.org` sites right and every `.co.uk` site wrong. In the editor that shortcut is one more step: a [find and replace](/util/replace/) with the pattern `^.*\.([^.\n]+\.[^.\n]+)$`, the replacement `$1` and the flags `gm` keeps the last two labels of each hostname, so it extracts the registrable domain of `.com`-style hosts, and the wrong part of `shop.example.co.uk` or an IP address.

## Limits

- The link has to come first on its line. A label in front, as in `Home: https://www.example.com`, gives `home`, and a line that is not a link at all, such as a header row, comes out as its first word. Leave headers out of what you copy, or delete those rows afterwards.
- Internationalized domain names come out in their ASCII form, as browsers send them: `bücher.example` becomes `xn--bcher-kva.example`.
- IP addresses are returned as they are, IPv6 ones in brackets.
- Every input line gives one output line, duplicates included. For a list of distinct sites, add [deduplicate lines](/util/line_dedupe/) at the end, or [sort lines](/util/line_sort/) with remove duplicates ticked.

To clean the links themselves rather than reduce them to hosts, see [remove tracking parameters from URLs](/presets/remove-tracking-parameters-from-urls/).

## The same in code

In Python, `urllib.parse.urlsplit(u if "://" in u else "https://" + u).hostname` gives the hostname of one link, lowercased, and a loop over the column does the rest. JavaScript's `new URL(u).hostname` follows exactly the rules this preset uses, including the punycode conversion.
