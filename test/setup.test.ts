import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { getDb, type DatabaseEnv, type D1Database } from '../src/lib/db';

describe('Project setup & dependencies', () => {
  it('uses the configured D1 binding', () => {
    const database = { prepare: () => undefined } as unknown as D1Database;
    const env = { DB: database } satisfies DatabaseEnv;
    expect(getDb(env)).toBe(database);
  });

  it('validates zod schema parsing', () => {
    const voteSchema = z.object({
      state_code: z.string().length(2),
      choice: z.enum(['satisfied', 'dissatisfied']),
    });

    const valid = voteSchema.safeParse({
      state_code: 'DL',
      choice: 'satisfied',
    });

    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.state_code).toBe('DL');
      expect(valid.data.choice).toBe('satisfied');
    }

    const invalid = voteSchema.safeParse({
      state_code: 'DELHI',
      choice: 'neutral',
    });

    expect(invalid.success).toBe(false);
  });
});
