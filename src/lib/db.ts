export type D1Value = string | number | null | ArrayBuffer | ArrayBufferView;

export interface D1Result<T = unknown> {
  results: T[];
  success: boolean;
  meta: { changes: number };
}

export interface D1Statement {
  bind(...values: D1Value[]): D1Statement;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<D1Result>;
}

export interface D1Database {
  prepare(query: string): D1Statement;
}

export interface DatabaseEnv {
  DB: D1Database;
}

export function getDb(env: DatabaseEnv): D1Database {
  if (!env?.DB) {
    throw new Error('Cloudflare D1 binding "DB" is not configured.');
  }

  return env.DB;
}
