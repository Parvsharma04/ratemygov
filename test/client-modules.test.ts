import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Client script bundle sizes', () => {
  it('home and state client modules respect performance budgets', () => {
    const workerDir = path.resolve(process.cwd(), 'dist/_worker.js');
    expect(fs.existsSync(workerDir)).toBe(true);

    const manifestFiles = fs
      .readdirSync(workerDir)
      .filter((f) => f.startsWith('manifest_') && f.endsWith('.mjs'));
    expect(manifestFiles.length).toBeGreaterThan(0);

    const manifestContent = fs.readFileSync(
      path.join(workerDir, manifestFiles[0]),
      'utf8'
    );
    const idx = manifestContent.indexOf('"inlinedScripts":[');
    expect(idx).toBeGreaterThan(-1);

    const parsed = JSON.parse(
      manifestContent.slice(
        idx + 17,
        manifestContent.indexOf('],"assets":') + 1
      )
    ) as Array<[string, string]>;

    const homeEntry = parsed.find(([file]) => file.includes('index.astro'));
    const stateEntry = parsed.find(([file]) => file.includes('[slug].astro'));

    expect(homeEntry).toBeDefined();
    expect(stateEntry).toBeDefined();

    const homeBytes = Buffer.byteLength(homeEntry![1], 'utf8');
    const stateBytes = Buffer.byteLength(stateEntry![1], 'utf8');

    // Home page module must be under 0.5 KB (512 bytes) minified
    expect(homeBytes).toBeLessThan(512);

    // State page module must be under 2 KB (2048 bytes) minified
    expect(stateBytes).toBeLessThan(2048);

    // Total client JavaScript across both is well under the 3 KB budget
    expect(homeBytes + stateBytes).toBeLessThan(3072);
  });
});
