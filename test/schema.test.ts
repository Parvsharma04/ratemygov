import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

describe('Database Schema & Configuration', () => {
  const currentDir = fileURLToPath(new URL('.', import.meta.url));
  const schemaPath = resolve(currentDir, '../db/schema.sql');
  const d1SchemaPath = resolve(currentDir, '../db/schema-d1.sql');
  const envExamplePath = resolve(currentDir, '../.env.example');
  const wranglerPath = resolve(currentDir, '../wrangler.jsonc');

  it('contains a D1 schema with duplicate constraints and atomic counter trigger', () => {
    expect(existsSync(schemaPath)).toBe(true);
    const sql = readFileSync(schemaPath, 'utf8');
    expect(readFileSync(d1SchemaPath, 'utf8')).toBe(sql);

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS votes');
    expect(sql).toMatch(/state_code\s+integer\s+NOT\s+NULL/i);
    expect(sql).toMatch(/voter_hash\s+blob\s+NOT\s+NULL/i);
    expect(sql).toMatch(/ip_hash\s+blob\s+NOT\s+NULL/i);
    expect(sql).toMatch(/choice\s+integer\s+NOT\s+NULL/i);
    expect(sql).toMatch(/PRIMARY\s+KEY\s*\(\s*state_code\s*,\s*voter_hash\s*\)/i);
    expect(sql).toMatch(/UNIQUE\s*\(\s*state_code\s*,\s*ip_hash\s*\)/i);
    expect(sql).toMatch(/CREATE\s+TRIGGER\s+IF\s+NOT\s+EXISTS\s+votes_after_insert/i);
    expect(sql).toMatch(/AFTER\s+INSERT\s+ON\s+votes/i);
    expect(sql).toMatch(/UPDATE\s+vote_counts/i);

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS vote_counts');
    expect(sql).toMatch(/PRIMARY\s+KEY\s*\(\s*state_code\s*,\s*shard\s*\)/i);
    expect(sql).toMatch(/state_code\s*<\s*36/i);
    expect(sql).toMatch(/shard\s*<\s*15/i);
    expect(sql).toMatch(/ON\s+CONFLICT\s*\(state_code,\s*shard\)\s+DO\s+NOTHING/i);

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS daily_snapshots');
    expect(sql).toMatch(/PRIMARY\s+KEY\s*\(\s*day\s*,\s*state_code\s*\)/i);
  });

  it('configures the runtime D1 binding used by the application', () => {
    const config = JSON.parse(readFileSync(wranglerPath, 'utf8'));
    expect(config.d1_databases).toContainEqual(
      expect.objectContaining({
        binding: 'DB',
        database_name: 'rate-my-gov',
      })
    );
  });

  it('documents all required environment variables in .env.example', () => {
    expect(existsSync(envExamplePath)).toBe(true);
    const env = readFileSync(envExamplePath, 'utf8');

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
