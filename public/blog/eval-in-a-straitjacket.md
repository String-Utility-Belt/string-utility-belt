---
title: "eval() in a straitjacket: sandboxing JavaScript under CSP"
description: "How I let people run their own JavaScript on a site where they paste secrets, with no unsafe-inline, no server, and nowhere for their data to go."
date: 2026-10-17
slug: eval-in-a-straitjacket
tags: [javascript, security, csp, sandbox]
image: /blog/eval-in-a-straitjacket.png
---

# eval() in a straitjacket: sandboxing JavaScript under CSP

I run [String Utility Belt](/), a browser tool for chaining text transformations. Decode the Base64, pretty-print the JSON, pull out one field, save and reuse this pipeline everywhere. It has a couple of hundred built-in tools, but you will still, one day, need the one I didn't write.

So there's an escape hatch: a [custom JavaScript step](/util/custom_js/). You write a function body, it gets `input`, and whatever you return goes to the next step.

Lovely feature. Terrifying feature.

The trouble is who uses a site like this. People debugging auth. They paste JWTs, Kubernetes secrets and the odd production API key that really should not be in a browser tab. And pipelines are shared as links. Put those together and you get the nightmare:

1. Someone shares a link to a handy-looking pipeline.
2. It has a custom JavaScript step in it.
3. Some dummy pastes their production token in to try it.

This post is about the sandbox that makes step 3 boring. It runs your code with nowhere to send anything, it never runs a stranger's code until you say so, and it does all of it under a Content-Security-Policy so strict that it broke the sandbox the day I switched it on.

## Russian dolls

The sandbox is four layers, each more paranoid than the one outside it:

```plaintext
your page             the site's CSP: inline scripts by hash only
└ <iframe sandbox>    built from a string, opaque origin, its own CSP
  └ bootstrap         reads the job, starts the Worker
    └ Web Worker      where your code actually runs
```

The iframe isn't loaded from a URL. The app builds its entire HTML as a string for each run and hands it over in the `srcdoc` attribute.

It also gets `sandbox="allow-scripts"`. The `sandbox` attribute starts a frame with almost everything switched off, and you add permissions back one at a time. `allow-scripts` lets JavaScript run. The one I pointedly leave out is `allow-same-origin`. A `srcdoc` frame with both would share my page's origin, and could simply reach up and delete its own sandbox attribute.

Without it, the frame gets an opaque origin. Browsers decide who can read what by origin (scheme, host and port), and an opaque origin is a unique one that matches no real site, mine included. So the frame is a stranger from nowhere. No cookies, no `localStorage`, no IndexedDB, no poking around in my page's DOM. The one thing it can do is `postMessage`.

The frame also has its own CSP, set by a `<meta>` tag at the top of that string, because a string has no response headers. It starts from `default-src 'none'`, which blocks every kind of load, then allows back just enough to run inline scripts, compile your code and start a Worker. No `fetch`, no XHR, no WebSockets, no `import()` or `importScripts()` from any URL. Your code can compute whatever it likes. It just can't tell anyone.

Inside the frame, a small bootstrap script reads the job (your code, your input, a security token and a time limit), starts a Web Worker and passes the result back to my page.

Your code runs in that Worker, because `while (true) {}` exists. A Worker runs on its own thread, so an infinite loop burns that thread instead of freezing the tab. It can't touch any page. And when your code runs past its time limit, the frame calls `terminate()` and that's the end of that. A Worker needs a script to start from, and the frame can't download one (that's the point of `default-src 'none'`), so the bootstrap builds the Worker's script in memory as a `Blob` and starts it from a `blob:` URL.

Every run gets a fresh frame, removed afterwards, so nothing one run does survives into the next. The frame is invisible but not `display: none`, because browsers may deprioritise frames that aren't rendered, and I'd rather your code didn't get throttled into a timeout.

That's the part you'll find in blog posts already. The rest is what nobody warned me about.

## The day the CSP ate my sandbox

The sandbox is about two weeks older than the site's Content-Security-Policy. The policy had to wait until I ripped out AdSense, because ad networks load scripts from wherever they please, and a strict CSP exists to stop exactly that. Google Analytics went the next day. Google Fonts went two days after that. Every third party I deleted made the policy shorter.

Today the site's `script-src` (the part of the policy that decides which scripts run) is `'self'`, Cloudflare's analytics beacon, two SHA-256 hashes, and two eval keywords I'll own up to later. There's no `'unsafe-inline'`, which means an inline `<script>` only runs if the header lists the SHA-256 hash of its exact text. Change one character and the hash stops matching, and the browser refuses to run it. My CSP is a bouncer with a clipboard, and it doesn't care that I own the club.

What I hadn't appreciated is that the sandbox inherits that policy. A `srcdoc` frame and a `blob:` Worker have no HTTP response of their own, so no headers of their own either. Instead they inherit the policy of the page that created them, and keep their own on top. A script has to get past both bouncers.

Which was a problem, because this is how the frame's script used to be built:

```js
`<script>
var SUBELT_JOB=${jobLiteral(job)};\n${inlineScript(BOOTSTRAP_SOURCE)}
</script>`
```

The job was pasted straight into the script. Every run made a brand-new script. A brand-new script has a brand-new hash. A brand-new hash isn't on the clipboard. The sandbox was now perfectly secure, in the sense that nothing could run in it at all.

The fix was to stop mixing code and data:

```js
`<script
    type="application/json"
    id="${JOB_ELEMENT_ID}"
>
${jobJson(job)}
</script>`
+
`<script>
${SANDBOX_BOOTSTRAP_SCRIPT}
</script>`
```

The bootstrap is now identical, byte for byte, on every run. One script, one hash, and that hash is on the list. The job rides alongside in a `<script type="application/json">`. A script tag whose type isn't JavaScript is just a box of text: the browser never runs it, so the CSP has nothing to object to, and the bootstrap reads it back with a boring `JSON.parse(...textContent)`.

## JSON in a script tag is one string away from HTML

That job holds whatever you typed, and it now lives inside a `<script>` element. The HTML parser doesn't understand JSON. It just scans for the text that ends the element. So if your code contains `</script>`, the parser closes the element right there, and everything after it becomes page markup. `<!--` followed by `<script` does the opposite: the parser stops treating the next `</script>` as the end, and the element swallows whatever comes after it.

The fix is one line. In valid JSON a `<` can only appear inside a string, and inside a JSON string the six characters `\u003c` are just another way of writing `<`:

```js
const jobJson = (job) => JSON.stringify(job).replace(/</g, '\\u003c')
```

The HTML parser never sees a `<`. `JSON.parse` on the other side turns it back into one and never knows anything happened.

## Never whisper secrets into a frame

The obvious way to hand a frame its work is to wait for it to load and `postMessage` the code and input in. Please don't.

`postMessage` takes a second argument: the origin you expect the receiving window to have. If anyone else is in that window, the browser drops the message. A frame with an opaque origin has no origin you can write down, so the only option is `'*'`, meaning deliver to whoever's there right now.

And whoever's there might not be your frame. If another site embeds yours in an iframe, the browser lets it navigate the frames inside yours, for example pointing your sandbox frame at a page of its own. Get the timing right and your user's input gets posted straight into the attacker's page. It's shouting a password across a room and hoping the right person is standing there.

So my page never sends the frame anything. The job is baked into the frame's original HTML, and messages only ever travel outward, frame to page. Each one carries the token from the job: 16 random bytes that only that original document knows. My page ignores any message that isn't from that frame's window or doesn't carry the token. A page that hijacks the frame finds nothing to steal and has no way to fake a result.

## The Worker checks its own cage

All of this leans on the frame's CSP reaching the Worker by inheritance. I don't like leaning on things. If some browser ever forgot to apply the policy to a `blob:` Worker, your code would quietly have the network.

So before it runs anything, the Worker tries to do things it must not be able to do. My first version tried one. `importScripts()` loads a script into a Worker, and a `data:` URL is a script packed into the URL itself:

```js
function scriptsBlocked() {
  try { importScripts('data:text/javascript,'); } catch (e) { return true; }
  return false;
}
```

`data:` isn't on the frame's list of allowed script sources, so under a working policy this throws. If it didn't throw, the Worker refused to run your code, with an error that said why. I was quite pleased with it.

While writing this post I suddenly had a thought: what if the Worker gets my site's policy but not the frame's? Remember, it inherits both. My site's `script-src` doesn't allow `data:` either, so the check would throw and pass. Meanwhile the site's `connect-src`, the part of the policy that decides where `fetch` may go, allows my own site and anything on `https:`, because the "fetch a URL" feature needs it. A check that passes in exactly the situation it exists to catch isn't a check. It's a decoration.

So I tried it. In Chromium, with the frame's `<meta>` policy deleted, the `data:` script was refused exactly as before, and a `fetch` to my own site went straight through. The hole was made of my own policy.

The fix is a second test, one the site's policy can't pass on the frame's behalf. The Worker now also sends a request to my own site, which the site's policy allows and only the frame's `default-src 'none'` blocks:

```js
// probe: /robots.txt on my own site
return fetch(probe, {
    method: 'HEAD',
    mode: 'no-cors',
    credentials: 'omit'
})
  .then(() => false, () => true); // rejected means blocked
```

`/robots.txt` is the most boring file I own, which makes it perfect. `no-cors` is the important bit. The Worker's origin is opaque, so a normal request would fail CORS even after escaping, and I'd mistake an escape for a block. A `no-cors` request that gets sent succeeds, so the only way this one fails is being blocked, or being offline, when your code has nowhere to send anything anyway. A missing or odd probe URL counts as an escape, so a broken job fails closed.

Your code runs only once both tests fail. If either one works, the Worker refuses: a sandbox that can't prove it's a sandbox doesn't get to run anything. In the browsers I test, the frame's policy does reach the Worker, so the request is blocked before it's sent and costs nothing. The check is for the browser I don't test.

A few smaller habits in the Worker, each there because the alternative was worse:

- It grabs `self.postMessage` before your code runs, so your code can't break the reporting by overwriting it. (It can still post a message of its own, but that's no more powerful than returning a value. Your code decides its own result either way.)
- It says "I'm alive" before running anything, so the timer measures your code and not how long the browser took to spin up a thread.
- Your code is compiled with the `AsyncFunction` constructor, so `await` just works. That's `new Function`'s async sibling. It has no global name, so you have to dig it out of an async function's prototype.
- The whole thing is wrapped in a function that calls itself straight away, because a top-level `var` in a Worker script is a global, and globals are things your code could read and overwrite.

## The asterisk on my smug CSP

`'unsafe-eval'` is the CSP keyword that lets a page turn strings into code with `eval` or `new Function`. Compiling your code is exactly that, and because the Worker inherits the site's policy, the site's own `script-src` has to allow `'unsafe-eval'` too. It does. Take it out and the custom JavaScript end-to-end test fails, which is how I know it's actually needed and not just lying around. (The other eval keyword, `'wasm-unsafe-eval'`, is for the WebAssembly hashing utilities. Strictly, `'unsafe-eval'` already allows WebAssembly too, so it's redundant today. It stays so the hashing utilities keep working if `'unsafe-eval'` ever goes.)

What it costs: if my own app code ever passed attacker-controlled text to `eval` or `new Function`, the policy wouldn't save me. What it doesn't cost: an injected inline `<script>` that isn't on the hash list still won't run, and neither will inline `onclick=` handlers or `javascript:` URLs. (CSP does have a keyword that lets hashes allow those too, `'unsafe-hashes'`. My policy leaves it out.) That isn't the same as "injected HTML can't run anything". An injected `<script src>` pointing at my own site or Cloudflare's beacon would still load, because those sources are allowed. The policy stops new code, not every misuse of code that's already allowed.

If you can avoid running user code, avoid it. I couldn't, so the trade-off is written down in a comment right next to the policy instead of being quietly ignored.

## Why not just use another domain?

You may have been shouting this at the screen for a while. CodePen and JSFiddle run your code on a separate domain, and that makes a lot of this post go away. A frame loaded from its own domain gets its policy from its own response headers and inherits nothing from mine. My site could drop `'unsafe-eval'` and the sandbox's hash, and I could `postMessage` the job to a named origin instead of baking it into the HTML.

I didn't, for two reasons. The first is offline support. String Utility Belt installs as an app and keeps working with no connection, because a service worker serves it from a cache. A service worker only looks after its own origin, so a sandbox on another domain would need an offline story of its own, and custom JavaScript would be the first thing to break on a train. The second is that a second domain is a second thing to buy, deploy, renew and secure, for a one-person project. A subdomain wouldn't do either: it counts as the same site as mine, and shares more with it than a sandbox should.

So the `srcdoc` frame stays, and the price is the asterisk above. I'd rather pay it in plain sight than pretend it isn't there.

## Strangers' code doesn't run on a click

The sandbox stops code from leaking your input. It does nothing about a link whose code quietly mangles your input in a way you won't spot until later. That's a trust problem, and no sandbox fixes trust.

So every pipeline that arrives from outside (a share link, an embed, an imported file) goes through quarantine before it reaches the editor. Every custom JavaScript step is switched off, and its card says:

*This step runs JavaScript. Read the code before you turn it on, especially if it came from someone else's link.*

You read it. You switch it on. Opening a link never runs a stranger's code.

The fiddly part is "every". Steps can contain other steps: parallel branches, macros, and "run on each" steps that run a whole sub-pipeline on every line. A code step can hide at any depth. The quarantine used to know about branches and macros by name. Then I added "run on each", and that list of names turned into a liability, because every new kind of nesting is a fresh chance to forget one. Now every step type has to say where it keeps its nested steps, in one function, `mapChildSequences`, and the quarantine just asks:

```ts
const walk = (seq: PipelineStep[]): PipelineStep[] =>
  seq.map(s => (isCodeStep(s) ? { ...s, enabled: false } : mapChildSequences(s, walk)))
```

I also realised while writing this that "has to" really meant "I promise to remember". Forget a new step type, and the quarantine would see a step with nothing inside it and walk straight past any code in there. So now the compiler remembers for me. `mapChildSequences` switches over every step type, and the default case passes the step to a function that only accepts `never`, the type TypeScript gives a value once every case is handled:

```ts
default:
  return unknownStepType(step) // only compiles if every step type is handled above
```

Add a new kind of step, forget it here, and the build fails and names the culprit. I checked with a made-up `LoopStep`. The compiler was not subtle about it.

It also finds code steps by what they are, never by their id. A crafted link could give a code step the same id as a harmless one, because ids come from the link, and links lie.

## Who checks the checker?

A hash-only CSP has a nasty failure mode. Edit one character of an inline script, the hash changes, and production silently blocks it. The only people who see an error are your users, in their browser console, if they happen to look.

So the policy is under test three ways:

1. A unit test hashes every inline script that should run and compares the hashes with the ones in `_headers`, the file Cloudflare reads my response headers from. There are two such scripts: the sandbox bootstrap, and a little script in `index.html` that applies your saved theme before the first paint, so dark mode never flashes light. When the hashes differ, the test failure tells me exactly which hash to add and which to delete.
2. Every build checks every built page, a few hundred of them, for inline scripts whose hash isn't listed, `on*=` handlers and `javascript:` URLs. A stylesheet loading a font from somewhere the policy doesn't allow fails it too.
3. The end-to-end tests run under the real policy. `vite preview`, which serves the production build locally, applies the same `_headers` file. One suite loads every kind of page and fails on a single CSP violation report. Another runs custom code in Chromium and Firefox and counts every request that actually leaves the browser while it does. The right number is zero.

That last test used to check that a `fetch` to example.com failed. It would have failed anyway, on CORS, after the request had left, so it could pass with the cage wide open. Now it counts requests at the network layer, and before it trusts a zero it makes sure it can count, by letting an ordinary Worker send one. Then I built the app with the frame's policy loosened, to watch the safety nets work. With the probe in place, the Worker refused to run the code. With the probe switched off as well, the code's request got out and the test went red. Each net caught it on its own.

The build check had adventures of its own. The day after it went in, CodeQL, GitHub's code scanner, found a hole in it.

The checker found scripts in each page with a regex, and the regex assumed a script ends at `</script>`. Browsers are more relaxed than that. A script ends at `</script` followed by whitespace, `/` or `>`, and anything after that is ignored. So in this:

```html
<script type="application/json">{}</script x><script>steal()</script>
```

a browser ends the JSON block at `</script x>`, then runs `steal()`. My checker kept reading to the next `</script>`, decided `steal()` was part of the JSON, and skipped it, because JSON blocks don't run.

CodeQL found it by reading the code, not because anything had gone wrong. And in fairness to the bouncer, the real CSP would still have stopped `steal()` in production. But the checker exists so I find out at build time, not from somebody's console. One regex later, that case was fixed. My robot that guards the policy had a blind spot, and it took a different robot to find it.

Writing this post showed me that "one regex later" was the real problem. My regexes didn't know that browsers still run `type="text/javascript1.5"`, that `href="&#106;avascript:go()"` is a `javascript:` URL with its first letter written as a character reference, or that `<img/onerror=go()>` is a working event handler with a slash where the space usually goes. And they flagged scripts inside HTML comments, which never run. The checker now parses each page with parse5, which follows the HTML standard's parsing rules, and uses the standard's rules for which scripts run. Six new tests cover what the regexes got wrong, and the old checker fails all six. Everyone knows you can't parse HTML with a regex. So did I. I did it anyway, and it worked right up until somebody looked.

A bonus trap from the same file, free of charge: browsers convert `\r\n` and `\r` line endings to `\n` before they parse HTML, so the hash has to be of the converted text. Git on Windows often checks files out with `\r\n` endings, so hash the file as it sits on disk there and you'll get a hash no browser will ever produce.

## What I'd tell myself at the start

- Pick the CSP first. Everything else bends around it, and retrofitting means rebuilding things you thought were finished.
- Never post a secret into a frame. Bake it into the document and only ever listen.
- Make the sandbox prove it's a sandbox before it runs anything, and make sure your own policy can't pass the test on its behalf.
- Code from a link is a stranger. Treat it like one.
- Test the policy, and then test the thing that tests the policy.
- Then show it to someone who'd enjoy finding holes in it.

`eval` is still in there. It's just wearing a straitjacket, in a locked room, in a building with a very picky bouncer.

The code is MIT on GitHub. The sandbox lives in [`src/app/sandbox/`](https://github.com/String-Utility-Belt/string-utility-belt/tree/main/src/app/sandbox) and the policy checks in [`scripts/csp.ts`](https://github.com/String-Utility-Belt/string-utility-belt/blob/main/scripts/csp.ts). Writing this post has already turned up a few loose straps. If you find another, I'd love to hear about it before anyone else does: [the security policy](https://github.com/String-Utility-Belt/string-utility-belt/blob/main/SECURITY.md) says how to tell me privately.
