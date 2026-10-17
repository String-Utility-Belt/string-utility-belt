---
title: JSON to PowerShell Invoke-RestMethod Command Builder
description: Turn JSON describing an HTTP request into a runnable PowerShell Invoke-RestMethod or Invoke-WebRequest command, with headers, body and auth.
---
## What does this tool do?

It takes a JSON object describing an HTTP request and writes the PowerShell command that sends it: `Invoke-RestMethod` by default, or `Invoke-WebRequest` if you want the status code and response headers as well. The input shape is the one [curl command to json](/util/curl_parse/) produces (`method`, `url`, `headers`, `body`, `auth`, `form` and `flags`), so the two chain naturally, but hand-written JSON works too. Only `url` is required.

The output is written for PowerShell 7. Every value is quoted so that PowerShell hands the server exactly the bytes in your JSON: nothing in the URL, the headers or the body is expanded as a variable or an escape.

## How it works

A request with more than two parameters is written as a hashtable passed with `@params` (PowerShell calls this splatting). That way each parameter sits on its own line, with no backtick at the end of a line to break if the line picks up a trailing space:

```example
title: a POST with a bearer token and a JSON body
input:
{
  "method": "POST",
  "url": "https://api.example.com/v1/users",
  "headers": { "Authorization": "Bearer test_token_123", "Content-Type": "application/json" },
  "body": "{\"name\":\"Ada\"}"
}
output:
$params = @{
  Uri = 'https://api.example.com/v1/users'
  Method = 'Post'
  Headers = @{
    'Authorization' = 'Bearer test_token_123'
  }
  ContentType = 'application/json'
  Body = '{"name":"Ada"}'
}
Invoke-RestMethod @params
```

Some headers move to their own parameter: `Content-Type` becomes `-ContentType` and `User-Agent` becomes `-UserAgent`. `Content-Length` is dropped, because PowerShell measures the body itself. A request with only a URL and a method stays on one line:

```example
title: a short request stays on one line
input: {"method": "DELETE", "url": "https://api.example.com/v1/users/42"}
output: Invoke-RestMethod -Uri 'https://api.example.com/v1/users/42' -Method Delete
```

Credentials in `auth` go out the way curl's `-u` sends them: as a Basic `Authorization` header on the first request, written as an expression so you can still read and edit the user name and password. PowerShell's `-Credential` alone would wait for the server to ask with a 401, which many APIs never do:

```example
title: basic auth, sent up front like curl -u
input: {"url": "https://api.example.com/v1/me", "auth": {"user": "api", "password": "example-pass"}}
params: {"multiline": false}
output: Invoke-RestMethod -Uri 'https://api.example.com/v1/me' -Headers @{ 'Authorization' = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes('api:example-pass')) }
```

## Quoting and the request body

Values are single-quoted, where PowerShell expands nothing; an apostrophe inside one is doubled. PowerShell also treats the typographic quotes ‘ and ’ as single quotes, so those are doubled too, and a body that contains "it’s" still arrives intact. A value with a carriage return or another control character is double-quoted with backtick escapes instead, because a single-quoted string can only hold such a character as raw text.

A multi-line body goes in a single-quoted here-string assigned to `$body`, so JSON keeps its layout and needs no escaping at all. A body with characters outside ASCII is sent as UTF-8 bytes: before PowerShell 7.4, and in Windows PowerShell, a string body without a charset goes out as ISO-8859-1, and `Zoë` would reach the server mangled.

```example
title: a multi-line JSON body in a here-string
input:
{
  "method": "PUT",
  "url": "https://api.example.com/v1/users/42",
  "headers": { "Content-Type": "application/json" },
  "body": "{\n  \"name\": \"Ada\",\n  \"role\": \"admin\"\n}"
}
output:
$body = @'
{
  "name": "Ada",
  "role": "admin"
}
'@
$params = @{
  Uri = 'https://api.example.com/v1/users/42'
  Method = 'Put'
  ContentType = 'application/json'
  Body = $body
}
Invoke-RestMethod @params
```

## Options

- **cmdlet**: `Invoke-RestMethod` (default) returns the parsed JSON or XML. `Invoke-WebRequest` returns the whole response, with `StatusCode`, `Headers` and the raw `Content`; it also gets `-UseBasicParsing`, which Windows PowerShell 5.1 needs on machines without Internet Explorer set up and PowerShell 7 ignores.
- **splat across lines**: on by default. Off, the tool writes one command line, and a multi-line body becomes a double-quoted string with backtick-n line breaks.
- **pretty-print a json body**: off by default, so the body is sent byte for byte as given. Turn it on to re-indent a JSON body for reading, but not for a request whose body is signed, such as a webhook with an HMAC signature header.

## Flags, files and form fields

The `flags` object takes curl's flag names. Those with a PowerShell parameter are converted: `insecure` (`-k`) to `-SkipCertificateCheck`, `max-time` to `-TimeoutSec` (rounded up to whole seconds), `max-redirs` to `-MaximumRedirection`, `retry` to `-MaximumRetryCount`, `proxy` to `-Proxy`, `output` to `-OutFile`, `http1.1`, `http2` and `http3` to `-HttpVersion`, `range` to a `Range` header, and `location-trusted` to `-PreserveAuthorizationOnRedirect`. Some need nothing, because PowerShell already behaves that way: it follows redirects (`-L`), decompresses gzip and deflate (`--compressed`), and throws on a 4xx or 5xx status (`-f`). A body of `@file` (curl's `-d @file`) and an `upload-file` (`-T`) become `-InFile`.

Flags without an equivalent, such as `--cacert`, `--cookie-jar` or `--resolve`, are listed by name in a comment above the command, so you can see what was left out. Their values are never copied into it, because a flag like `--proxy-user` carries a password.

Form fields become `-Form`: a value of `@path` uploads that file with `Get-Item`, and `<path` sends the file's text as the field value. PowerShell sends uploaded files as `application/octet-stream` under their own name, so curl's `;type=` and `;filename=` options are listed as not converted. `-Form` and the other PowerShell 7 parameters above do not exist in Windows PowerShell 5.1.

## Tips and pitfalls

- Going the other way, [json to curl command](/util/curl_build/) turns the same JSON into a curl command for bash or `curl.exe`.
- PowerShell 7 checks header values and may rewrite their spacing (`en-US,en;q=0.9` goes out as `en-US, en; q=0.9`). Add `-SkipHeaderValidation` if a server needs the exact text.
- Unlike curl, PowerShell follows redirects and treats an error status as an exception. Add `-SkipHttpErrorCheck` to read a 4xx response body the way curl prints it.
- To check the quoting of one value for another shell, use [shell quote](/util/shell_quote/).
