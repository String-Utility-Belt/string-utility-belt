---
title: Spring Boot application.yml to Environment Variables
description: Turn a Spring Boot application.yml into the environment variable names Spring documents, as .env lines and a Kubernetes env list with quoted values.
---

## Why the names are easy to get wrong

Running a Spring Boot service in a container usually means overriding `application.yml` with environment variables, so every property path has to become a variable name first. Spring Boot's [documented rules](https://docs.spring.io/spring-boot/reference/features/external-config.html#features.external-config.typesafe-configuration-properties.relaxed-binding.environment-variables) are short: replace dots with underscores, remove dashes, convert to upper case. A list element keeps its index between underscores, so the second broker in `spring.kafka.bootstrap-servers` is `SPRING_KAFKA_BOOTSTRAPSERVERS_1`.

The dash rule is where a plain flattener goes wrong. [json to .env](/util/json_to_env/) on its own turns every character a variable name cannot hold into an underscore, so `spring.jpa.hibernate.ddl-auto` comes out as `SPRING_JPA_HIBERNATE_DDL_AUTO`. Spring reads every underscore in a variable name as a dot, which makes that `ddl.auto`. When Spring looks up a property by name it also tries the underscore spelling as a legacy fallback, which is why such names often work, but map keys get no fallback: `MY_CLIENT` as an OAuth2 registration name is two levels, not `my-client`. The documented spelling, `SPRING_JPA_HIBERNATE_DDLAUTO`, is the one to write.

The second trap is the multi-document file. Many services keep profile overrides after a `---` line, and Spring applies those only when the profile is active. Treating the whole file as one configuration gives either duplicate names or a profile's values in every environment.

For a YAML file that is not a Spring Boot configuration, the [YAML to env converter](/presets/yaml-to-env/) preset makes plain `KEY=value` lines without Spring's naming rules.

## What each step does, and why in this order

[yaml to json](/util/yaml_to_json/) parses the file with "always emit an array" switched on, so a file with or without profile sections arrives as a list of documents, and [jsonpath query](/util/jsonpath/) keeps `$[0]`, the base configuration. To see a profile's overrides instead, change it to `$[1]` and delete the `SPRING_CONFIG_ACTIVATE_ONPROFILE` line from the result: that is the document's activation condition, not a setting.

The [sed script](/util/sed/) step then deletes the dashes in keys. A dash counts only when it sits in the first quoted string on a line and that string is directly followed by a colon, so values such as `order-service` or a host name keep theirs. This has to happen before flattening: once a path is joined, the underscore that replaced a dash looks exactly like the one that replaced a dot.

The branch flattens the document twice. The first lane writes `KEY=value` lines and quotes only values that need it: whitespace, quotes, backticks, `#`, `$` or a backslash. A value with `$` or a backslash gets single quotes unless it also holds an apostrophe or a line break, and Docker Compose reads single-quoted values literally in an `env_file`. A value with both `$` and an apostrophe gets double quotes, where Compose still expands `$`, so check such lines by hand. The second lane quotes every value and turns each line into a `name`/`value` pair under `env:`, ready to indent into a container spec. Kubernetes requires every value to be a string, and an unquoted `8080` or `false` is a number or a boolean in YAML.

## What it does not handle

Only the first document is converted. Profile sections are skipped, and so is any later document without an activation condition, even though Spring would apply it on top of the base. YAML merge keys (`<<: *defaults`) are not expanded: the parser follows YAML 1.2, where `<<` is an ordinary key, so those entries get a stray `___` in their names, while Spring's parser merges them. Unquoted numbers are rewritten the way JSON writes them, so `1.0` becomes `1` and integers longer than 15 digits can lose precision; quote such values in the YAML when the exact text matters.

Map keys lose information, because Spring lower-cases variable names and reads every underscore as a dot. An OAuth2 client registration named `my-client` binds as `myclient`. Logging levels work for packages but not for a logger name with capitals, such as the class `com.example.OrderService` or Hibernate's `org.hibernate.SQL`, which arrives as `org.hibernate.sql`. A key containing an underscore, like `hibernate.jdbc.batch_size` under `spring.jpa.properties`, arrives as `hibernate.jdbc.batch.size`, and bracketed keys such as `[mail.smtp.auth]` come out with stray underscores. For these, set `SPRING_APPLICATION_JSON` to a JSON object holding just those properties: Spring keeps its keys as written, the way it reads YAML keys.

Lists are replaced, not merged. Spring binds a list from the highest-priority source that defines it, so setting only `SPRING_KAFKA_BOOTSTRAPSERVERS_0` gives a one-element list rather than changing the first broker. Override every index of a list, or none.

Placeholders are copied as text. `SPRING_DATASOURCE_PASSWORD='${DB_PASSWORD}'` still works because Spring resolves the placeholder at startup, as long as `DB_PASSWORD` is set too; in Kubernetes you would normally point that entry at a Secret with `valueFrom.secretKeyRef`. Kubernetes also expands `$(NAME)` references in values and turns `$$` into `$`. And `docker run --env-file` keeps quotes as part of the value, so remove them before using the lines there.

## Doing it from the command line

With Mike Farah's yq (v4), `yq -o=props 'select(document_index == 0)' application.yml` prints the flattened properties as lines such as `spring.jpa.hibernate.ddl-auto = validate`, with list items as `.0` and `.1`. Piping that into `awk -F' = ' '/^[^#]/ { k = toupper($1); gsub(/-/, "", k); gsub(/\./, "_", k); print k "=" substr($0, length($1) + 4) }'` applies the three rules to each name. yq expands merge keys and prints numbers as written; otherwise you get the same names as this preset, with the same map-key limits, and values without any quoting.
