---
title: DST Checker Online: Missing & Repeated Local Times
description: Free daylight saving time (DST) checker: find nonexistent or repeated local times for cron jobs, with exact UTC instants and time zone offsets.
---
## Why clocks skip or repeat times

This **daylight saving time (DST) checker** finds dates when a local time does not exist or occurs twice in an IANA time zone. Use it to check a daily or weekly job such as "02:30 Europe/Belgrade" before a clock change.

A local time does not always identify one moment. When a time zone moves its clocks forward, some wall-clock times never occur. When clocks move backward, a stretch of local times occurs twice. The checker finds those exceptions for the times you enter, one per line, over an inclusive calendar date range.

Enter `HH:MM` or `HH:MM:SS` using the 24-hour clock. Blank lines and surrounding whitespace are ignored. Choose an IANA zone such as `Europe/Belgrade`; the default is `Europe/London`. An empty start date means today in that zone. The default range is 366 days, with a maximum of 400, and the start date counts as day one.

Every offset change counts, including changes to standard time and government decisions to move a calendar day. The tool does not require a transition to be labelled daylight saving time.

```example
title: Belgrade skips 02:30 in spring
params: {"timeZone":"Europe/Belgrade","start":"2027-03-28","days":1}
input: 02:30
output: 2027-03-28 02:30  missing   clocks go forward 1 hour at 2027-03-28T01:00:00Z (UTC+01:00 → UTC+02:00)
```

## How to check a local time for DST conflicts

1. Enter the job's local run time, such as `01:30`. Add other times on separate lines.
2. Select the schedule's IANA time zone, such as `Europe/London`, rather than a fixed UTC offset. The zone identifies which clock-change rules to use.
3. Set a start date and the number of calendar days to check. Choose a weekday if the job runs weekly.
4. Read the missing or repeated dates, or select JSON to use the results in another step.

For example, a London job at 01:30 encounters a repeated time on 25 October 2026. Both UTC instants below represent the same local time.

```example
title: check a London job when British Summer Time ends
params: {"timeZone":"Europe/London","start":"2026-10-01","days":31}
input: 01:30
output: 2026-10-25 01:30  repeated  2026-10-25T00:30:00Z (UTC+01:00), 2026-10-25T01:30:00Z (UTC+00:00)
```

## Reading the results: nonexistent and ambiguous times

A **nonexistent local time** falls in a forward clock change's gap and is reported as `missing`. An **ambiguous local time** falls in a backward clock change's overlap and is reported as `repeated`. These terms describe whether a local date and time can identify a UTC instant.

Results are sorted by local date, then time. A **missing** result shows the size of the forward jump, the UTC instant of the change, and the offsets before and after it. A **repeated** result lists both possible UTC instants in chronological order, each with its offset. `Z` marks UTC; `UTC-05:00` means five hours behind UTC.

The JSON option returns an array of objects with `date`, `time`, `kind`, `instants`, and `transition`. Missing times have an empty `instants` array. Every `transition` contains `at` as a UTC timestamp and `from` and `to` as offset strings. With no findings, JSON returns an empty array; text names the times, zone and inclusive range.

```example
title: two instants share the same Belgrade wall time
params: {"timeZone":"Europe/Belgrade","start":"2026-10-25","days":1}
input: 02:30
output: 2026-10-25 02:30  repeated  2026-10-25T00:30:00Z (UTC+02:00), 2026-10-25T01:30:00Z (UTC+01:00)
```

Use [timestamp convert](/util/timestamp_convert/) to convert a UTC instant to a Unix timestamp and [date format](/util/date_format/) to display it in another time zone or pattern.

## Checking cron jobs across daylight saving time changes

For a daily job, leave weekday set to `any`. For a weekly job, choose its local weekday. The filter applies to the affected local date, even when the transition happens at midnight on the next day. Enter several run times on separate lines to check them together.

Schedulers handle skipped and repeated times differently. Check your scheduler's documentation and that schedule's configured time zone and transition policy. These findings describe the clock; they do not predict whether your particular job will run, be skipped, or be retried. [cron describe](/util/cron_describe/) helps read the schedule expression.

The affected hour differs by zone: Belgrade repeats 02:00–02:59, while New York repeats 01:00–01:59. New York's 02:30 can disappear in spring, but it does not repeat in autumn.

```example
title: a Sunday job in New York
params: {"timeZone":"America/New_York","start":"2026-10-01","days":200,"weekday":"sunday"}
input: 01:30
output: 2026-11-01 01:30  repeated  2026-11-01T05:30:00Z (UTC-04:00), 2026-11-01T06:30:00Z (UTC-05:00)
```

## The southern hemisphere and 30-minute shifts

The season and size of a shift vary. Australia/Lord_Howe moves forward by 30 minutes in October and backward by 30 minutes in April. Its spring gap contains 02:15, while its autumn repeated window contains 01:45. Do not assume every change is an hour or that October always means clocks move backward.

```example
title: Lord Howe skips half an hour
params: {"timeZone":"Australia/Lord_Howe","start":"2026-10-04","days":1}
input: 02:15
output: 2026-10-04 02:15  missing   clocks go forward 30 minutes at 2026-10-03T15:30:00Z (UTC+10:30 → UTC+11:00)
```

```example
title: Lord Howe repeats 01:45 in April
params: {"timeZone":"Australia/Lord_Howe","start":"2027-04-04","days":1}
input: 01:45
output: 2027-04-04 01:45  repeated  2027-04-03T14:45:00Z (UTC+11:00), 2027-04-03T15:15:00Z (UTC+10:30)
```

## Limits and historical ranges

This utility uses the runtime's own time zone database through Intl. An outdated browser or Node version can disagree with a newer one, especially after governments announce rule changes. Future results reflect the rules currently installed, and historical results depend on the historical records in that database. Past ranges work: Apia skipped the entire local date 2011-12-30 when it moved across the date line.

The utility samples offsets every six hours and refines detected changes to the second. Two offset changes inside a single sampling interval can be missed; this is not an exhaustive reconstruction of arbitrary clock histories. It checks the supplied wall times, rather than listing every transition or validating a scheduler's execution history.

```example
title: Apia skipped a whole day
params: {"timeZone":"Pacific/Apia","start":"2011-12-28","days":5}
input: 12:00
output: 2011-12-30 12:00  missing   clocks go forward 1 day at 2011-12-30T10:00:00Z (UTC-10:00 → UTC+14:00)
```
