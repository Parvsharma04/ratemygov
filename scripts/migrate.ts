import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const schemaPath = fileURLToPath(new URL('../db/schema-d1.sql', import.meta.url));
const target = process.argv.includes('--remote') ? '--remote' : '--local';

try {
  execFileSync(
    'pnpm',
    [
      'exec',
      'wrangler',
      'd1',
      'execute',
      'rate-my-gov',
      target,
      '--file',
      schemaPath,
    ],
    { stdio: 'inherit' }
  );
} catch (error) {
  console.error('D1 migration failed.', error);
  process.exitCode = 1;
}
