import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import postgres from 'postgres';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigration(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('Error: DATABASE_URL environment variable is required to run migrations.');
    console.error('Example: postgresql://user:password@host:port/database?sslmode=require');
    process.exit(1);
  }

  const schemaPath = resolve(__dirname, '../db/schema.sql');
  const schemaSql = readFileSync(schemaPath, 'utf8');

  console.log('Connecting to database...');
  const sql = postgres(databaseUrl, {
    max: 1,
    connect_timeout: 10,
    onnotice: () => {}, // suppress notice spam on migrations
  });

  try {
    console.log(`Applying schema from ${schemaPath}...`);
    await sql.unsafe(schemaSql);
    console.log('Migration completed successfully.');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// Execute migration if script is run directly
runMigration().catch((error) => {
  console.error('Fatal migration error:', error);
  process.exit(1);
});
