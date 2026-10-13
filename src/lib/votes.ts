import { sql } from './db';

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

export interface StateRecentVotes {
  stateCode: number;
  slug: string;
  name: string;
  votesLast5Min: number;
}

function normalizeHash(hash: Uint8Array | Buffer | string): Buffer {
  if (Buffer.isBuffer(hash)) {
    return hash;
  }
  if (typeof hash === 'string') {
    // If hexadecimal string, parse as hex; otherwise parse as utf-8
    const isHex = /^[0-9a-fA-F]+$/.test(hash) && hash.length % 2 === 0;
    return Buffer.from(hash, isHex ? 'hex' : 'utf8');
  }
  return Buffer.from(hash);
}

/**
 * Casts a vote atomically using one SQL statement.
 *
 * Conflict clause has no target; a clash on either the device key (state_code, voter_hash)
 * or IP key (state_code, ip_hash) causes the insert to do nothing and no counters are updated.
 *
 * Returns 'recorded' if recorded, 'duplicate' otherwise.
 */
export async function castVote({
  stateCode,
  choice,
  voterHash,
  ipHash,
  geoState = null,
}: CastVoteParams): Promise<VoteResult> {
  const shard = Math.floor(Math.random() * 16);
  const geoMatch =
    geoState === null || geoState === undefined ? null : geoState === stateCode;

  const voterHashBuf = normalizeHash(voterHash);
  const ipHashBuf = normalizeHash(ipHash);

  const rows = await sql`
    with ins as (
      insert into votes(state_code, voter_hash, ip_hash, choice, geo_state, geo_match)
      values (${stateCode}, ${voterHashBuf}, ${ipHashBuf}, ${choice}, ${geoState ?? null}, ${geoMatch})
      on conflict do nothing
      returning choice
    )
    update vote_counts c
    set satisfied = c.satisfied + (case when ins.choice then 1 else 0 end),
        dissatisfied = c.dissatisfied + (case when ins.choice then 0 else 1 end)
    from ins
    where c.state_code = ${stateCode} and c.shard = ${shard}
    returning 1
  `;

  return rows.length > 0 ? 'recorded' : 'duplicate';
}

/**
 * Returns totals for a single state by summing across all 16 shards.
 */
export async function getStateTotals(stateCode: number): Promise<StateTotals> {
  const rows = await sql`
    select
      coalesce(sum(satisfied), 0)::bigint as satisfied,
      coalesce(sum(dissatisfied), 0)::bigint as dissatisfied
    from vote_counts
    where state_code = ${stateCode}
  `;

  const satisfied = Number(rows[0]?.satisfied ?? 0);
  const dissatisfied = Number(rows[0]?.dissatisfied ?? 0);

  return {
    stateCode,
    satisfied,
    dissatisfied,
    total: satisfied + dissatisfied,
  };
}

/**
 * Returns totals across all states via a single grouped query.
 */
export async function getAllTotals(): Promise<StateTotals[]> {
  const rows = await sql`
    select
      state_code,
      coalesce(sum(satisfied), 0)::bigint as satisfied,
      coalesce(sum(dissatisfied), 0)::bigint as dissatisfied
    from vote_counts
    group by state_code
    order by state_code asc
  `;

  return rows.map((r) => {
    const satisfied = Number(r.satisfied);
    const dissatisfied = Number(r.dissatisfied);
    return {
      stateCode: Number(r.state_code),
      satisfied,
      dissatisfied,
      total: satisfied + dissatisfied,
    };
  });
}

/**
 * Returns the count of votes recorded in the last 5 minutes per state.
 */
export async function getRecentVoteCounts(
  windowMinutes: number = 5
): Promise<Array<{ stateCode: number; count: number }>> {
  const rows = await sql`
    select
      state_code,
      count(*)::bigint as cnt
    from votes
    where created_at >= now() - (${windowMinutes} || ' minutes')::interval
    group by state_code
    order by state_code asc
  `;

  return rows.map((r) => ({
    stateCode: Number(r.state_code),
    count: Number(r.cnt),
  }));
}
