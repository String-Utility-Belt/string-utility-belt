---
title: Curl to PowerShell Converter: Invoke-RestMethod Command
description: Paste a curl command and get the same request as PowerShell Invoke-RestMethod, with headers, JSON body, auth and flags converted and quoted.
---

## Why a pasted curl command fails in PowerShell

API documentation shows requests as curl commands written for bash, and browser DevTools copy them the same way. Paste one into PowerShell and it usually breaks before it reaches the server. In Windows PowerShell 5.1, `curl` is an alias for `Invoke-WebRequest`, so `-H` and `-d` are read as that cmdlet's parameters and rejected. PowerShell 7 dropped the alias, and Windows 10 and 11 ship the real `curl.exe`, but the quoting is still bash quoting. The trailing backslash that splits the command over several lines means nothing to PowerShell. The `'\''` trick bash uses to put an apostrophe inside single quotes means nothing to PowerShell, which escapes an apostrophe by doubling it. A `$` inside double quotes turns into a variable lookup. And PowerShell before 7.3 drops the double quotes inside an argument it passes to a native program, so a JSON body reaches `curl.exe` as `{sku:SKU-1001}` and the API answers with a parse error.

Fixing those by hand means un-quoting the command the way bash would and then re-quoting every value the way PowerShell wants, which is easy to get wrong in a long Chrome copy with a dozen headers. Converting the request to PowerShell's own `Invoke-RestMethod` avoids native argument passing altogether: the URL, headers and body are ordinary PowerShell strings, and the cmdlet builds the HTTP request itself.

## What the two steps do

The first step, [curl command to json](/util/curl_parse/), tokenizes the command like a POSIX shell: single and double quotes, `$'…'` strings from Chrome, backslash escapes and line continuations. It then works out the request curl would send. `-d` without `-X` means POST, `-G` turns the data into a query string, `-u` is a user and password, and `-b` with a `name=value` pair is a Cookie header. The result is plain JSON you can read in the step's output.

The second step, [json to powershell request](/util/powershell_request_build/), writes that JSON as a splatted `Invoke-RestMethod` call: one `$params` hashtable with a line per parameter, then `Invoke-RestMethod @params`. Every value is single-quoted, so nothing in it is expanded, and an apostrophe is written twice. `Content-Type` and `User-Agent` move to `-ContentType` and `-UserAgent`. Credentials from `-u` become a Basic `Authorization` header sent on the first request, as curl sends them. Data without a content type gets `application/x-www-form-urlencoded`, curl's default for `-d`, written out so that every PowerShell version sends the same header.

The order is fixed: the builder only understands the parsed request, never the raw command. Between the two steps you can edit the JSON, for example to swap a test token for a variable, and the PowerShell output follows.

## What does not carry over

The output targets PowerShell 7. Windows PowerShell 5.1 has no `-SkipCertificateCheck` (curl's `-k`), `-Form` (`-F` uploads), `-MaximumRetryCount` or `-HttpVersion`, so a command that uses them needs PowerShell 7 or a rewrite. Curl options with no PowerShell counterpart, such as `--cacert`, `--resolve` or a cookie file given to `-b`, are named in a comment above the command and left out; their values are never copied, since some of them hold passwords.

PowerShell also behaves differently from curl in ways a converter cannot change. It follows redirects whether or not the command had `-L`, and it throws an exception on a 4xx or 5xx status where curl just prints the response; add `-SkipHttpErrorCheck` to get the body of an error back. `Invoke-RestMethod` turns a JSON response into objects rather than printing the raw text: switch the second step to `Invoke-WebRequest` and read `.Content` when you need the exact response, or `.StatusCode` and `.Headers`.

## Other ways to run a curl request on Windows

If you would rather keep curl, call `curl.exe` explicitly in PowerShell 7.3 or later, which passes quotes to native programs intact, and re-quote the command with [json to curl command](/util/curl_build/) set to the PowerShell flavor. Git Bash and WSL run the original bash command unchanged. Postman can import a curl command and export a PowerShell snippet, which means handing the request, token included, to another app. This preset runs in your browser, so the bearer tokens and cookies in a copied request stay on your machine.
