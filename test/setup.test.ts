import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import postgres from 'postgres';

describe('Project setup & dependencies', () => {
  it('validates postgres is importable as a function', () => {
    expect(typeof postgres).toBe('function');
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
