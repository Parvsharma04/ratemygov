import { getDb, type DatabaseEnv } from './db';

export type VoteResult = 'recorded' | 'duplicate';

export interface CastVoteParams {
  stateCode: number;
  choice: boolean;
  voterHash: Uint8Array | Buffer | string;
  ipHash: Uint8Array | Buffer | string;
  geoState?: number | null;
}

export interface StateTotals {
  stateCode: number;
  satisfied: number;
  dissatisfied: number;
  total: number;
}

function normalizeHash(hash: Uint8Array | Buffer | string): Buffer {
  if (Buffer.isBuffer(hash)) {
    return hash;
  }
  if (typeof hash === 'string') {
    const isHex = /^[0-9a-fA-F]+$/.test(hash) && hash.length % 2 === 0;
    return Buffer.from(hash, isHex ? 'hex' : 'utf8');
  }
  return Buffer.from(hash);
}

export async function castVote(
  env: DatabaseEnv,
  {
    stateCode,
    choice,
    voterHash,
    ipHash,
    geoState = null,
  }: CastVoteParams
): Promise<VoteResult> {
  const db = getDb(env);
  const geoMatch =
    geoState === null || geoState === undefined
      ? null
      : geoState === stateCode
        ? 1
        : 0;

  const voterHashBuf = normalizeHash(voterHash);
  const ipHashBuf = normalizeHash(ipHash);

  try {
    const result = await db
      .prepare(
        `
        INSERT OR IGNORE INTO votes (state_code, voter_hash, ip_hash, choice, geo_state, geo_match)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      )
      .bind(
        stateCode,
        voterHashBuf,
        ipHashBuf,
        choice ? 1 : 0,
        geoState,
        geoMatch
      )
      .run();

    return result.meta.changes === 0 ? 'duplicate' : 'recorded';
  } catch (error) {
    console.error('Vote error:', error);
    throw error;
  }
}

export async function getStateTotals(
  env: DatabaseEnv,
  stateCode: number
): Promise<StateTotals> {
  const db = getDb(env);

  const result = await db
    .prepare(
      `
      SELECT
        COALESCE(SUM(satisfied), 0) AS satisfied,
        COALESCE(SUM(dissatisfied), 0) AS dissatisfied
      FROM vote_counts
      WHERE state_code = ?
    `
    )
    .bind(stateCode)
    .first<{ satisfied: number; dissatisfied: number }>();

  const satisfied = Number(result?.satisfied ?? 0);
  const dissatisfied = Number(result?.dissatisfied ?? 0);

  return {
    stateCode,
    satisfied,
    dissatisfied,
    total: satisfied + dissatisfied,
  };
}

export async function getAllTotals(env: DatabaseEnv): Promise<StateTotals[]> {
  const db = getDb(env);

  const rows = await db
    .prepare(
      `
      SELECT
        state_code,
        COALESCE(SUM(satisfied), 0) AS satisfied,
        COALESCE(SUM(dissatisfied), 0) AS dissatisfied
      FROM vote_counts
      GROUP BY state_code
      ORDER BY state_code ASC
    `
    )
    .all<{ state_code: number; satisfied: number; dissatisfied: number }>();

  return rows.results.map((row) => {
    const satisfied = Number(row.satisfied);
    const dissatisfied = Number(row.dissatisfied);
    return {
      stateCode: Number(row.state_code),
      satisfied,
      dissatisfied,
      total: satisfied + dissatisfied,
    };
  });
}

export async function getRecentVoteCounts(
  env: DatabaseEnv,
  windowMinutes: number = 5
): Promise<Array<{ stateCode: number; count: number }>> {
  const db = getDb(env);

  const rows = await db
    .prepare(
      `
      SELECT
        state_code,
        COUNT(*) AS cnt
      FROM votes
      WHERE created_at >= datetime('now', '-' || ? || ' minutes')
      GROUP BY state_code
      ORDER BY state_code ASC
    `
    )
    .bind(windowMinutes)
    .all<{ state_code: number; cnt: number }>();

  return rows.results.map((row) => ({
    stateCode: Number(row.state_code),
    count: Number(row.cnt),
  }));
}
