-- POST /api/generate (worker/generate.ts, worker/ai-budget.ts): the AI pipeline builder's
-- daily spend, per-IP daily counts and answer cache. Pruned daily (worker/index.ts, scheduled):
-- ip rows after 2 days, spend rows after 92 days, cached answers after 30 days.

-- One row per UTC day. reserved_micro is in micro-dollars: each call reserves its worst case
-- here before it runs and is corrected to its actual cost afterwards.
CREATE TABLE ai_spend (
  day TEXT PRIMARY KEY,
  reserved_micro INTEGER NOT NULL DEFAULT 0,
  calls INTEGER NOT NULL DEFAULT 0
);

-- Model calls per client per UTC day. ip_hash is an HMAC (secret AI_IP_SALT) of the day and the
-- client's address bucket, so the address is never stored and hashes do not link across days.
CREATE TABLE ai_ip_daily (
  day TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, ip_hash)
);

-- Generated steps by a SHA-256 of the normalised description, model id and catalog version;
-- the description itself is not stored. created_at is Unix milliseconds.
CREATE TABLE ai_answer_cache (
  key TEXT PRIMARY KEY,
  steps TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE INDEX ai_answer_cache_created ON ai_answer_cache (created_at);
