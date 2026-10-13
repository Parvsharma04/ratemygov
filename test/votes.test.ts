import { describe, expect, it, vi } from 'vitest';
import { castVote } from '../src/lib/votes';
import type { DatabaseEnv, D1Result, D1Statement } from '../src/lib/db';

function createEnv(changes: number) {
  const run = vi.fn<() => Promise<D1Result>>().mockResolvedValue({
    results: [],
    success: true,
    meta: { changes },
  });
  const bind = vi.fn(() => statement);
  const statement = {
    bind,
    run,
  } as unknown as D1Statement;
  const prepare = vi.fn((_query: string) => statement);
  return {
    env: { DB: { prepare } } as unknown as DatabaseEnv,
    prepare,
    bind,
    run,
  };
}

describe('D1 vote persistence', () => {
  it('uses one atomic insert and treats a uniqueness conflict as a duplicate', async () => {
    const { env, prepare, bind, run } = createEnv(0);
    const result = await castVote(env, {
      stateCode: 9,
      choice: true,
      voterHash: Buffer.alloc(16, 1),
      ipHash: Buffer.alloc(16, 2),
    });

    expect(result).toBe('duplicate');
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(prepare.mock.calls[0][0]).toMatch(/INSERT OR IGNORE INTO votes/i);
    expect(bind).toHaveBeenCalledWith(9, expect.any(Buffer), expect.any(Buffer), 1, null, null);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('records the vote through the same single insert when no constraint conflicts', async () => {
    const { env, run } = createEnv(1);
    const result = await castVote(env, {
      stateCode: 9,
      choice: false,
      voterHash: Buffer.alloc(16, 3),
      ipHash: Buffer.alloc(16, 4),
      geoState: 9,
    });

    expect(result).toBe('recorded');
    expect(run).toHaveBeenCalledTimes(1);
  });
});
