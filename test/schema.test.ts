import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

describe('Database Schema & Configuration', () => {
  const currentDir = fileURLToPath(new URL('.', import.meta.url));
  const schemaPath = resolve(currentDir, '../db/schema.sql');
  const envExamplePath = resolve(currentDir, '../.env.example');

  it('contains schema.sql with all required tables and constraints', () => {
    expect(existsSync(schemaPath)).toBe(true);
    const sql = readFileSync(schemaPath, 'utf8');

    // 1. votes table
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS votes');
    expect(sql).toMatch(/state_code\s+smallint\s+NOT\s+NULL/i);
    expect(sql).toMatch(/voter_hash\s+bytea\s+NOT\s+NULL/i);
    expect(sql).toMatch(/ip_hash\s+bytea\s+NOT\s+NULL/i);
    expect(sql).toMatch(/choice\s+boolean\s+NOT\s+NULL/i);
    expect(sql).toMatch(/geo_state\s+smallint\s+NULL/i);
    expect(sql).toMatch(/geo_match\s+boolean\s+NULL/i);
    expect(sql).toMatch(/created_at\s+timestamptz\s+NOT\s+NULL/i);
    expect(sql).toMatch(/PRIMARY\s+KEY\s*\(\s*state_code\s*,\s*voter_hash\s*\)/i);
    expect(sql).toMatch(/UNIQUE\s*\(\s*state_code\s*,\s*ip_hash\s*\)/i);
    expect(sql).toMatch(/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_votes_created_at\s+ON\s+votes\s*\(\s*created_at\s*\)/i);

    // 2. vote_counts table & shard seeding
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS vote_counts');
    expect(sql).toMatch(/PRIMARY\s+KEY\s*\(\s*state_code\s*,\s*shard\s*\)/i);
    expect(sql).toMatch(/generate_series\(1,\s*36\)/i);
    expect(sql).toMatch(/generate_series\(0,\s*15\)/i);
    expect(sql).toMatch(/ON\s+CONFLICT\s*\(\s*state_code\s*,\s*shard\s*\)\s+DO\s+NOTHING/i);

    // 3. daily_snapshots table
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS daily_snapshots');
    expect(sql).toMatch(/PRIMARY\s+KEY\s*\(\s*day\s*,\s*state_code\s*\)/i);
  });

  it('documents all required environment variables in .env.example', () => {
    expect(existsSync(envExamplePath)).toBe(true);
    const env = readFileSync(envExamplePath, 'utf8');

    expect(env).toContain('DATABASE_URL=');
    expect(env).toContain('VOTER_PEPPER=');
    expect(env).toContain('TURNSTILE_SECRET=');
    expect(env).toContain('PUBLIC_TURNSTILE_SITEKEY=');
    expect(env).toContain('CRON_SECRET=');
    expect(env).toContain('GEO_MODE=');
    expect(env).toContain('MIN_RESPONSES=');
    expect(env).toContain('MIN_WINDOW_RESPONSES=');
    expect(env).toContain('LOAD_TEST_KEY=');
  });
});
