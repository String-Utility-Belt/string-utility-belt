---
title: Decode Every JWT in a Log, HAR or curl Trace at Once
description: Decode multiple JWT tokens at once: paste a log, HAR export or curl -v trace and read every token's payload, each once, with iat and exp shown as dates.
---

## Debugging with more than one token

When a sign-in flow or an API call fails, the evidence is usually a pile of text: an access log with a bearer token on every line, a HAR file exported from the browser's network panel, or the output of `curl -v`. The tokens in it hold what you need to know (who the user was, which audience and scopes the token was issued for, when it expired) but each one is a long `eyJ…` string, and a JWT debugger takes them one at a time. You copy a token out, paste it, convert `exp` from epoch seconds in your head, and repeat for the next request, often only to find it was the same token again.

This preset finds every token in what you paste, decodes each distinct one, and lists their payloads together, with the time claims already turned into dates.

## What each step does

[extract matches](/util/extract_preset/), set to JWTs, pulls out every string shaped like a token: `eyJ` followed by base64url parts separated by dots. It does not care where the token sits, so an `Authorization` header, a `?access_token=` query parameter, a cookie and a JSON response body all work, and with unique on, a token sent with fifty requests appears once.

The second step runs on each token on its own. [JWT decode](/util/jwt_decode/) reads the payload, the middle part, as JSON. A nested "run on each" then visits every claim and runs [timestamp convert](/util/timestamp_convert/) on the ones that hold epoch seconds between 2014 and 2033 (`iat`, `exp`, `nbf`, `auth_time` and custom claims like them), writing them as ISO 8601 in UTC. Strings, ids, arrays such as `groups` and other numbers stay as they are. A token that fails to decode is reported in the step's error and comes out as an empty line, which [JSONL to JSON](/util/jsonl_to_json/) skips while it gathers the payloads into one indented array, in the order the tokens first appeared.

## Limits

- Tokens that were URL-encoded (`Bearer%20eyJ…`, padding written as `%3D`) or wrapped across lines by a terminal are not decoded: at most a piece of one is found and reported as not a JWT. Run the text through a URL decoder, or join the lines, first.
- Strings that look like tokens but are not signed JWTs are reported and left out: a two-part fragment, an encrypted token (JWE, five parts), and a Flask session cookie, which starts the same way (read that one with the [Flask session cookie](/presets/decode-flask-session-cookie/) preset).
- Chrome and Edge 130 and later export HAR files without `Authorization` and `Cookie` headers. To include them, turn on *Allow to generate HAR with sensitive data* in DevTools settings under Network, then export again.
- Only the payload is shown, and nothing is verified: a decoded payload says what the token claims, not that the claims are true. To check a signature against a key or secret, use [JWT verify](/util/jwt_verify/). Whether a token has expired is for you to compare against its `exp`, since the page shows the same result on any date.
- Timestamps before mid-2014 or after May 2033 stay as numbers, as do claims in milliseconds.

## Tokens in logs are live credentials

Every access token you paste here works until it expires, and a refresh token often for weeks. The decoding runs in your browser and nothing you paste is uploaded, but treat the input like a password: "Open in the editor" hands it to the editor, which keeps recent inputs in this browser unless you open the History menu on its input panel and untick remember inputs, and a share link carries the input in the URL. If a log with tokens in it has been shared, attached to a ticket or committed anywhere, rotate the credentials and revoke the refresh tokens rather than waiting for them to expire, and ask whoever owns the logging to stop writing them.
