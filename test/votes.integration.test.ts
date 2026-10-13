import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { sql, closeDb } from '../src/lib/db';
import { castVote, getStateTotals, getAllTotals } from '../src/lib/votes';

const isDatabaseAvailable = Boolean(process.env.DATABASE_URL);

describe.skipIf(!isDatabaseAvailable)('Votes database integration', () => {
  const testStateCode = 12; // Haryana
  const concurrencyStateCode = 13; // Himachal Pradesh

  beforeAll(async () => {
    // Ensure test states have clean votes and zeroed counts
    await sql`delete from votes where state_code in (${testStateCode}, ${concurrencyStateCode})`;
    await sql`update vote_counts set satisfied = 0, dissatisfied = 0 where state_code in (${testStateCode}, ${concurrencyStateCode})`;
  });

  afterAll(async () => {
    await closeDb();
  });

  it('records first vote and updates counts', async () => {
    const voterA = crypto.randomBytes(32);
    const ipA = crypto.randomBytes(32);

    const result = await castVote({
      stateCode: testStateCode,
      choice: true,
      voterHash: voterA,
      ipHash: ipA,
      geoState: testStateCode,
    });

    expect(result).toBe('recorded');

    const totals = await getStateTotals(testStateCode);
    expect(totals.satisfied).toBe(1);
    expect(totals.dissatisfied).toBe(0);
    expect(totals.total).toBe(1);
  });

  it('rejects the same device as duplicate without altering counts', async () => {
    // Reuse voterA from previous test
    const voters = await sql`select voter_hash, ip_hash from votes where state_code = ${testStateCode} limit 1`;
    const voterA = voters[0].voter_hash as Buffer;
    const differentIp = crypto.randomBytes(32);

    const result = await castVote({
      stateCode: testStateCode,
      choice: false, // Trying to change choice
      voterHash: voterA,
      ipHash: differentIp,
    });

    expect(result).toBe('duplicate');

    const totals = await getStateTotals(testStateCode);
    expect(totals.satisfied).toBe(1);
    expect(totals.dissatisfied).toBe(0);
    expect(totals.total).toBe(1);
  });

  it('rejects a different device with the same IP hash as duplicate without altering counts', async () => {
    const voters = await sql`select voter_hash, ip_hash from votes where state_code = ${testStateCode} limit 1`;
    const ipA = voters[0].ip_hash as Buffer;
    const differentVoter = crypto.randomBytes(32);

    const result = await castVote({
      stateCode: testStateCode,
      choice: false,
      voterHash: differentVoter,
      ipHash: ipA,
    });

    expect(result).toBe('duplicate');

    const totals = await getStateTotals(testStateCode);
    expect(totals.satisfied).toBe(1);
    expect(totals.dissatisfied).toBe(0);
    expect(totals.total).toBe(1);
  });

  it('handles 200 concurrent votes with distinct devices and IPs producing an exact total', async () => {
    const totalVotes = 200;
    const satisfiedVotes = 135;
    const dissatisfiedVotes = 65;

    const votePromises = Array.from({ length: totalVotes }, (_, i) => {
      const isSatisfied = i < satisfiedVotes;
      return castVote({
        stateCode: concurrencyStateCode,
        choice: isSatisfied,
        voterHash: crypto.randomBytes(32),
        ipHash: crypto.randomBytes(32),
        geoState: concurrencyStateCode,
      });
    });

    const results = await Promise.all(votePromises);

    expect(results).toHaveLength(totalVotes);
    expect(results.every((r) => r === 'recorded')).toBe(true);

    const totals = await getStateTotals(concurrencyStateCode);
    expect(totals.satisfied).toBe(satisfiedVotes);
    expect(totals.dissatisfied).toBe(dissatisfiedVotes);
    expect(totals.total).toBe(totalVotes);

    const allTotals = await getAllTotals();
    const concurrencyState = allTotals.find((s) => s.stateCode === concurrencyStateCode);
    expect(concurrencyState).toBeDefined();
    expect(concurrencyState?.satisfied).toBe(satisfiedVotes);
    expect(concurrencyState?.dissatisfied).toBe(dissatisfiedVotes);
    expect(concurrencyState?.total).toBe(totalVotes);
  });
});
