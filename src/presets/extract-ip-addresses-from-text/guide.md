---
title: Extract IP Addresses From Text and Count Them Online
description: Pull every IPv4 address out of a log, email or document, deduplicate it and count how often each appears, most frequent first, as a tab-separated list.
---

## From a wall of text to a list of addresses

A log excerpt, an abuse report, a firewall export or a ticket full of pasted lines contains the addresses you need in among timestamps, process names and prose. The question is rarely just "which addresses are in here"; it is "which address is doing this, and how often". An extractor alone gives the first answer as a long list with repeats; counting by eye is where mistakes creep in. This pipeline pulls the addresses out, counts each one and sorts the result by how often it appears, so the top line is the address to block, allow or look up.

## What each step does

[Extract URLs, emails and patterns](/util/extract_preset/) set to IPv4 finds every dotted address and writes one per line. Each of the four parts has to be a number from 0 to 255 and the address has to stand on its own, so a version number such as `2.5.1`, a timestamp, a `HTTP/1.1` and a malformed `10.0.0.256` are not matched, while an address in the middle of a sentence or at the end of a log line is.

[Sort lines](/util/line_sort/) in natural mode orders the addresses numerically part by part, so `192.0.2.8` comes before `192.0.2.10`, which an alphabetical sort gets wrong. The step is there for the sake of the next one: the counter keeps addresses with the same count in the order it first sees them, and after this sort that order is numeric. In the first example two addresses appear twice; sorted, `192.0.2.8` is listed before `198.51.100.17`, where the raw log order would have put them the other way round.

[Count duplicate lines](/util/uniq_count/) collapses the list to one line per address with its count in front, most frequent first, separated by a tab. The tab is deliberate: paste the output into a spreadsheet and it lands in two columns. Set the step's format to `line-count` for the address first, or to `json` for a structure a script can read.

## Reading the result and adapting it

The right-hand column alone is a deduplicated list of every address, in count order; sort it with a second natural sort if you want it numeric. For only the repeat offenders, turn on the counter's `only duplicates` option. To keep private addresses out of the list, add a [grep lines](/util/grep_lines/) step after the extraction with an inverted match on `^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|127\.)`, which drops RFC 1918 and loopback ranges before counting. For IPv6 addresses, add `ipv6` to the extraction step's types; they are then counted alongside, in a consistent order rather than true numeric order, since the natural sort reads hex groups as text.

An address that appears twice on one line, such as a client and a proxy in an access log line that logs both, is counted twice, which is the right answer to "how often does this address appear" and the wrong one to "how many requests", so for request counts extract from one field only, with a [regex extract](/util/regex_extract/) step in place of the first one. The whole run is in your browser; the log is not uploaded.

## Keeping the pipeline

Open in the editor, add the private-range filter or the IPv6 type, and save the pipeline to your library to run it on the next excerpt in two clicks. The `subelt` command-line tool runs a saved pipeline file over a whole log, the browser extension runs it on text selected in a web-based log viewer, and the MCP server lets an AI assistant run it on text it is given. On a Unix shell, `grep -oE '\b([0-9]{1,3}\.){3}[0-9]{1,3}\b' auth.log | sort -V | uniq -c | sort -rn` is the same three steps, minus the 0-to-255 check and with the ties in reverse order.
