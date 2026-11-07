---
title: Decode a Flask Session Cookie Online to Readable JSON
description: Flask session cookie decoder: paste the cookie, or the Cookie or Set-Cookie header carrying it, and read the session data as JSON, even compressed .eJ cookies.
---

## What is inside the cookie

Flask's default session interface keeps the whole session in the cookie. It is signed with the app's `SECRET_KEY`, so the server can tell if it was changed, but not encrypted: anyone who holds the cookie can read it. There is nothing to decrypt and no secret key to find: reading it takes only the steps below, and the key matters only for checking the signature. Decoding it is a routine step when a login, a flash message or a CSRF check misbehaves in your own app. Copy the value from your browser's developer tools (Application > Cookies in Chrome, Storage > Cookies in Firefox).

The value is produced by itsdangerous and has three parts separated by dots: `payload.timestamp.signature`. The payload is the session as compact JSON, encoded as URL-safe Base64 without padding. When zlib compression makes the payload at least two bytes shorter, itsdangerous compresses it and marks it with a leading dot. That is why a compressed Flask session cookie begins with `.eJ`: a zlib stream at the default compression level starts with the bytes 78 9C, which Base64 encodes as `eJ`.

A plain Base64 decoder stumbles on the dots and turns a compressed payload into binary noise. The payload has to be cut out, decoded, inflated only when it is compressed, and then formatted, in that order.

## What each step does

The [sed script](/util/sed/) step isolates the payload. Its first command removes everything up to the last `session=`, so you can paste a `Cookie:` request header, `curl -i` response headers or a Copy as cURL command as well as the bare value. The next commands drop what follows the value (attributes, other cookies, line breaks), the compression dot, and the timestamp and signature. If your app sets `SESSION_COOKIE_NAME`, put that name in place of `session` in the first command; a bare value works either way.

[base64url decode](/util/base64url_decode/) turns the payload into raw bytes. It accepts the URL-safe alphabet and the missing padding that itsdangerous produces.

[deflate decompress](/util/deflate_decompress/) inflates the zlib stream and verifies its Adler-32 checksum, so a value cut short or altered in copying stops with an error rather than yielding wrong JSON. Its condition runs it only when the first byte is `x` (0x78, the zlib header byte). An uncompressed payload starts with `{` and passes straight through, as in the Cookie header sample.

[json pretty](/util/json_pretty/) indents the JSON. By default Flask writes it with sorted keys and non-ASCII characters escaped, so `zurück` is stored as `zur\u00fcck`; the formatted output shows the characters themselves.

## Reading the decoded session

Flask's tagged JSON serializer stores types JSON has no syntax for as a one-key object whose key starts with a space: `" t"` holds a tuple, `" b"` bytes in Base64, `" d"` a datetime as an HTTP date, `" u"` a UUID as 32 hex digits and `" m"` a Markup string. The pipeline shows these tags as stored. Flash messages are tuples: `flash()` appends a category and message pair to `_flashes`. A `_permanent` key appears once a view sets `session.permanent = True`, which gives the cookie an `Expires` date `PERMANENT_SESSION_LIFETIME` ahead instead of ending with the browser session.

Flask-Login keeps the user's ID in `_user_id`, a `_fresh` flag, and `_id`, a SHA-512 hash of the client's IP address and user agent. If a later request's IP address or user agent no longer matches `_id`, its default `basic` session protection sets `_fresh` to false, while `strong` protection logs the user out of a non-permanent session. Flask-WTF stores its CSRF token as `csrf_token`.

## What this does not check

Decoding reads the cookie; it does not verify it. The signature and timestamp are dropped unchecked, so a cookie that decodes cleanly can still be one your server rejects. On each request that carries the cookie, Flask checks the signature with the secret key and the timestamp against `PERMANENT_SESSION_LIFETIME`, and when either check fails it quietly starts an empty session. A user logged out at random may be sending a cookie that decodes fine here but was signed by another instance with a different `SECRET_KEY`.

An empty result from a `Set-Cookie` line means Flask deleted the cookie (`Max-Age=0`) because the session was emptied, for example by `session.clear()` at logout. If the JSON step fails on binary noise, the app probably keeps sessions on the server (with Flask-Session, for example) and the cookie holds only a session ID. Werkzeug warns when a session cookie passes 4093 bytes (Flask's `MAX_COOKIE_SIZE`), because browsers may silently ignore it; decoding it shows which keys take the space.

## Doing it in Python

Without the key, Python's standard library is enough, with the bare cookie value in `COOKIE`: `python3 -c 'import sys,zlib,base64,json;c=sys.argv[1];z=c[0]==".";p=c.lstrip(".").split(".")[0];d=base64.urlsafe_b64decode(p+"="*(-len(p)%4));print(json.dumps(json.loads(zlib.decompress(d) if z else d),indent=2))' "$COOKIE"`. Inside your own app, `app.session_interface.get_signing_serializer(app).loads(cookie)` also verifies the signature, raises `BadSignature` when it does not match, and turns the tags back into Python tuples, bytes and datetimes. Pass `max_age` to apply the same expiry check Flask does.
