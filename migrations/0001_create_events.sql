-- One row per counted event (POST /api/event, worker/events.ts): the same name and ids
-- written to the Analytics Engine dataset sub_events, nothing about the request.
-- Rows older than 92 days are deleted daily (worker/index.ts, scheduled).
CREATE TABLE events (
  id INTEGER PRIMARY KEY,
  ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  name TEXT NOT NULL,
  blob1 TEXT NOT NULL,
  blob2 TEXT NOT NULL
);

CREATE INDEX events_ts ON events (ts);
