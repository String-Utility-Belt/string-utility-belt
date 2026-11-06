---
title: YAML to Env Converter: Config File to KEY=value Lines Online
description: Convert a YAML config file to .env variables: nested keys joined with underscores, list items numbered, names upper-cased and values quoted only when needed.
---

## From a config file to environment variables

A service that reads `config.yml` on a developer's machine usually reads environment variables in a container, a CI job or a platform like Heroku, Render or Fly. The settings are the same; only the shape differs. YAML nests them, environment variables flatten them into one name each, and the flattening follows a convention most frameworks share: join the path with underscores, number list items, upper-case the whole name. Doing that by hand for a file with forty settings is slow, and the mistakes are quiet ones: a forgotten level in a name, a value with a space that the dotenv parser cuts at the space, a `$` that gets expanded.

This preset does the flattening, and its second step knows the quoting rules of `.env` files, which is where a quick script usually gets it wrong.

## What the steps do

[YAML to JSON](/util/yaml_to_json/) parses the file. YAML's own rules apply: `8080` is a number and `"8080"` a string, `true` a boolean, anchors and aliases are resolved and comments dropped. A file with several documents separated by `---` comes out of this step as a list of documents, which the next step refuses, because a `.env` file needs one object; keep the first document, or use the [Spring Boot application.yml](/presets/spring-boot-yaml-to-env-vars/) preset, which picks the base document out of a profile-separated file and applies Spring's own naming rules.

[JSON to .env](/util/json_to_env/) walks the object and writes one line per leaf value. Nested keys are joined with `_`, so `database.pool.max` becomes `DATABASE_POOL_MAX`; list items get their position, so the second `cors_origins` entry is `CORS_ORIGINS_1`; and any character a variable name cannot contain, such as a dash, a dot or a space in a key, is replaced with an underscore. Values are quoted only when a dotenv parser would otherwise misread them: a space, `#`, `"`, a backslash or a `$`. A value with `$` or a backslash and no apostrophe gets single quotes, which dotenv parsers read literally, so `${DB_PASSWORD}` stays a placeholder rather than being expanded while the file is read. Everything else gets double quotes with the inner quotes and newlines escaped.

## What to check before you commit the file

Dotenv dialects disagree on quoting. Docker Compose's `env_file` reads single-quoted values literally and expands `$` inside double quotes; `docker run --env-file` keeps the quotes as part of the value and expands nothing; Node's dotenv and Python's python-dotenv follow the Compose rules closely. The `quote` setting of the second step switches to `always` for a Kubernetes-style file where every value must be a string, or `never` for `docker run`, where quotes would end up inside the value.

Names lose information. Both `log-level` and `log_level` become `LOG_LEVEL`, and `server.port` and `server: {port}` give the same `SERVER_PORT`, so two YAML keys can collide into one variable. A key that already contains an underscore, like `dark_mode`, cannot be told apart from a nested `dark: {mode}` once flattened, which is a reason to keep the YAML file as the source of truth and generate the env file from it, rather than the other way around. Empty objects and empty lists produce a variable with an empty value.

Multi-line values, such as a PEM certificate, come out double-quoted with `\n` escapes, which Compose and dotenv read back correctly and a plain shell `source` does not.

## Keeping the conversion

Open in the editor to change the quoting mode or add an `export ` prefix for a file meant to be sourced by a shell, then save the pipeline to your library and run it again after every config change. The `subelt` command-line tool runs the same saved pipeline in a build script, which keeps the generated `.env` in step with the YAML automatically; the VS Code extension runs it on the open file. The conversion runs in your browser and the file is not uploaded, so a config full of hostnames and placeholders can be pasted as it is; real secrets belong in a secret store, and the [.env to Kubernetes Secret](/presets/env-file-to-kubernetes-secret/) preset takes the output of this one and encodes it for that.
