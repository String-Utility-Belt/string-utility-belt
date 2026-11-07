---
title: Shell Escape Online: Quote for Bash, PowerShell and cmd
description: Escape or quote text online so it survives a shell as a single argument: POSIX bash/sh, PowerShell or Windows cmd.exe, with per-flavor edge cases handled.
---
## Why does shell quoting matter?

Every shell has its own rules for which characters are special: spaces split arguments, `$` starts a variable, `"` and `'` change how the rest of a line is read, and so on. Building a command line by simply concatenating a variable into it is exactly how shell injection bugs happen. This tool takes a piece of text and produces a version meant to reach the command literally in a POSIX-compatible shell (sh, dash, bash, ksh, zsh), PowerShell, or Windows `cmd.exe`, either as one fully quoted argument or with just the dangerous characters escaped. Each flavor has limits, listed under the tips below.

## How it works

The **flavor** option picks the target shell, and **mode** picks the strategy:

- **quote** always produces a single argument, wrapped in the shell's string-literal syntax. This is the safer default: it works for arbitrary text, including spaces and most special characters, without you needing to know exactly which characters are dangerous.
- **escape** only neutralizes the specific characters that shell would otherwise interpret, leaving the rest of the text bare. Useful when you are inserting the result into a larger unquoted command template.

```example
title: posix quote mode (the default)
input: it's a test
output: 'it'\''s a test'
```

POSIX single quotes cannot contain a literal single quote at all, so `'it'\''s a test'` is built from three concatenated pieces: `'it'` (quoted), `\'` (an escaped literal quote outside the quotes), and `'s a test'` (quoted again). A shell reassembles those into `it's a test` as one argument.

```example
title: powershell quote mode
params: {"flavor": "powershell", "mode": "quote"}
input: hello world
output: 'hello world'
```

PowerShell's single-quoted strings are simpler: an embedded `'` is escaped by doubling it (`''`), with no equivalent of the POSIX concatenation trick needed.

### Escape mode

Escape mode neutralizes special characters one at a time instead of wrapping the whole value, which only makes sense once you know the surrounding command will not add its own quotes.

```example
title: posix escape mode
params: {"flavor": "posix", "mode": "escape"}
input: hello world
output: hello\ world
```

```example
title: cmd.exe escape mode uses carets
params: {"flavor": "cmd", "mode": "escape"}
input: a & b
output: a ^& b
```

`cmd.exe` escaping is deliberately narrow: a caret only hides a character from `cmd.exe`'s own line parser, it does nothing about how the receiving program splits its arguments. Whitespace is intentionally left unescaped in `cmd` escape mode for that reason. Use `quote` mode whenever the text needs to arrive as one argument.

```example
title: powershell escape mode backticks a leading dash
params: {"flavor": "powershell", "mode": "escape"}
input: -Force
output: `-Force
```

A leading `-` is backtick-escaped in PowerShell escape mode because an unescaped one would be read as a parameter name rather than a value. Newlines, carriage returns and tabs become PowerShell's backtick escapes for them (backtick followed by `n`, `r` or `t`). A leading space is a different problem: PowerShell drops a backtick-escaped space while it is still skipping the whitespace before an argument, so this tool refuses that input in escape mode and asks you to use quote mode instead.

## Options

- **flavor**: `posix` (default; sh, dash, bash, ksh, zsh; not fish or csh/tcsh, whose quoting rules differ), `powershell` or `cmd`.
- **mode**: `quote` (default; wrap as one argument) or `escape` (neutralize special characters only).

## Common uses

- Safely inserting a variable value (a filename, a user-supplied string, a URL) into a shell command built as a string.
- Preparing arguments for scripts, CI pipeline steps, or `Invoke-Expression`/`ssh`-style remote command strings.
- Understanding why a particular value breaks a command line, by seeing exactly how it needs to be escaped for that shell.
- Converting a value between shell conventions when porting a script from bash to PowerShell or `cmd.exe`.

## Tips and pitfalls

- Quoting and escaping solve the same problem differently: `quote` mode is more robust for arbitrary or unknown text, since it does not depend on you correctly identifying every special character; `escape` mode is only safe when you fully control the surrounding command template.
- None of the three flavors can represent every input. A literal `NUL` byte cannot survive any of them (shells cannot carry it at all), `cmd.exe` cannot represent line breaks inside a single argument, and PowerShell escape mode cannot escape a leading space. This tool throws a specific error in each of those cases rather than silently producing broken output.
- `cmd` quote mode follows the rules a Windows program uses to split its command line back into arguments (`CommandLineToArgvW` and the Microsoft C runtime), including doubling runs of backslashes that precede a quote, a detail that trips up many hand-rolled Windows quoting functions. That is correct when the program is started directly, but `cmd.exe` itself does not understand `\"`: if the command line passes through `cmd.exe` (a `.bat` or `.cmd` file, `cmd /c`, a `system()` call), text containing a `"` next to `&`, `|`, `<` or `>` can break out of the quotes and run a second command, and `%VAR%` references are still expanded inside the quotes. Do not route untrusted text through `cmd.exe` this way.
- `cmd` escape mode's carets follow interactive command-line rules; inside a batch file a literal `%` has to be written as `%%` instead.
- PowerShell also treats the typographic quotes `‘ ’ ‚ ‛` as single quotes (and `“ ” „` as double quotes), but this tool leaves them untouched in both modes, so in quote mode a `’` in the input ends the string early. Replace them with plain quotes before quoting untrusted text for PowerShell.
- In zsh, `posix` escape mode leaves a leading `=` bare, and zsh's default `EQUALS` option expands `=word` to the path of a command named `word`. Use quote mode for zsh when the text can start with `=`.
- For escaping text that will end up in a SQL statement rather than a shell command, use [sql escape](/util/sql_escape/) instead. Despite the surface similarity, the two have entirely different rules.
