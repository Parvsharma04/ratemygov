-- Rate My Gov PostgreSQL Schema
-- Idempotent initialization script for Cloudflare Workers / Hyperdrive deployment

-- 1. Individual votes table
-- duplicate prevention: one vote per state per voter_hash (device) and one vote per state per ip_hash
CREATE TABLE IF NOT EXISTS votes (
  state_code smallint NOT NULL,
  voter_hash bytea NOT NULL,
  ip_hash bytea NOT NULL,
  choice boolean NOT NULL,
  geo_state smallint NULL,
  geo_match boolean NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (state_code, voter_hash),
  CONSTRAINT uq_votes_state_ip UNIQUE (state_code, ip_hash)
);

-- Index for snapshotting and time-bounded queries
CREATE INDEX IF NOT EXISTS idx_votes_created_at ON votes (created_at);

COMMENT ON TABLE votes IS 'Individual voluntary governance votes with privacy-preserving cryptographic hashes';
COMMENT ON COLUMN votes.choice IS 'true = satisfied, false = dissatisfied';
COMMENT ON COLUMN votes.geo_state IS 'State code inferred from visitor IP, null when unknown';
COMMENT ON COLUMN votes.geo_match IS 'Whether geo_state equals state_code, null when unknown';

-- 2. Sharded vote counter table
-- 16 shards per state to minimize write lock contention on high-concurrency atomic increments
CREATE TABLE IF NOT EXISTS vote_counts (
  state_code smallint NOT NULL,
  shard smallint NOT NULL,
  satisfied bigint NOT NULL DEFAULT 0,
  dissatisfied bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (state_code, shard)
);

-- Seed 16 shards (0..15) for each of the 36 Indian states and UTs (1..36)
INSERT INTO vote_counts (state_code, shard, satisfied, dissatisfied)
SELECT
  s.state_code::smallint,
  sh.shard::smallint,
  0,
  0
FROM generate_series(1, 36) AS s(state_code)
CROSS JOIN generate_series(0, 15) AS sh(shard)
ON CONFLICT (state_code, shard) DO NOTHING;

-- 3. Daily historical aggregates table
-- Stored snapshots for historical trend rendering without querying raw votes
CREATE TABLE IF NOT EXISTS daily_snapshots (
  day date NOT NULL,
  state_code smallint NOT NULL,
  satisfied bigint NOT NULL,
  dissatisfied bigint NOT NULL,
  PRIMARY KEY (day, state_code)
);

CREATE INDEX IF NOT EXISTS idx_daily_snapshots_state_day ON daily_snapshots (state_code, day);
