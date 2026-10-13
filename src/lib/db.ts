import postgres from 'postgres';

let client: postgres.Sql | null = null;

/**
 * Returns the singleton postgres.js connection instance.
 * Configured with single connection pool and prepare: false for transaction poolers / Hyperdrive.
 */
export function getDb(connectionString?: string): postgres.Sql {
  if (client) {
    return client;
  }

  const url = connectionString ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL environment variable is not configured');
  }

  client = postgres(url, {
    max: 1,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 5,
  });

  return client;
}

/**
 * Exported proxy client that delegates to the lazy module-scoped singleton.
 * Enables direct `sql`...`` tagged template queries throughout the application.
 */
export const sql: postgres.Sql = new Proxy((() => {}) as unknown as postgres.Sql, {
  apply(_target, thisArg, argArray) {
    return Reflect.apply(getDb() as unknown as Function, thisArg, argArray);
  },
  get(_target, prop, receiver) {
    const db = getDb();
    const value = Reflect.get(db, prop, receiver);
    if (typeof value === 'function') {
      return value.bind(db);
    }
    return value;
  },
});

/**
 * Closes the active database connection if initialized.
 */
export async function closeDb(): Promise<void> {
  if (client) {
    const active = client;
    client = null;
    await active.end({ timeout: 5 });
  }
}
