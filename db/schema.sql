-- Rate My Gov schema for Cloudflare D1 (SQLite).

CREATE TABLE IF NOT EXISTS votes (
  state_code INTEGER NOT NULL,
  voter_hash BLOB NOT NULL,
  ip_hash BLOB NOT NULL,
  choice INTEGER NOT NULL CHECK (choice IN (0, 1)),
  geo_state INTEGER,
  geo_match INTEGER CHECK (geo_match IN (0, 1) OR geo_match IS NULL),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (state_code, voter_hash),
  UNIQUE (state_code, ip_hash)
);

CREATE INDEX IF NOT EXISTS idx_votes_created_at ON votes (created_at);

CREATE TABLE IF NOT EXISTS vote_counts (
  state_code INTEGER NOT NULL,
  shard INTEGER NOT NULL,
  satisfied INTEGER NOT NULL DEFAULT 0,
  dissatisfied INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (state_code, shard)
);

WITH RECURSIVE states(state_code) AS (
  SELECT 1
  UNION ALL
  SELECT state_code + 1 FROM states WHERE state_code < 36
), shards(shard) AS (
  SELECT 0
  UNION ALL
  SELECT shard + 1 FROM shards WHERE shard < 15
)
INSERT INTO vote_counts (state_code, shard, satisfied, dissatisfied)
SELECT state_code, shard, 0, 0
FROM states CROSS JOIN shards
WHERE 1
ON CONFLICT (state_code, shard) DO NOTHING;

CREATE TABLE IF NOT EXISTS daily_snapshots (
  day TEXT NOT NULL,
  state_code INTEGER NOT NULL,
  satisfied INTEGER NOT NULL,
  dissatisfied INTEGER NOT NULL,
  PRIMARY KEY (day, state_code)
);

CREATE INDEX IF NOT EXISTS idx_daily_snapshots_state_day
  ON daily_snapshots (state_code, day);

CREATE TRIGGER IF NOT EXISTS votes_after_insert
AFTER INSERT ON votes
BEGIN
  UPDATE vote_counts
  SET
    satisfied = satisfied + CASE WHEN NEW.choice = 1 THEN 1 ELSE 0 END,
    dissatisfied = dissatisfied + CASE WHEN NEW.choice = 0 THEN 1 ELSE 0 END
  WHERE state_code = NEW.state_code
    AND shard = instr('0123456789ABCDEF', substr(hex(NEW.voter_hash), 1, 1)) - 1;
END;
