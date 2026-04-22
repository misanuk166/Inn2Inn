// Pipeline-side Postgres client. Distinct from lib/db.ts (which is server-only
// for the Next.js app) so we can use it from plain Node scripts without
// hitting the "server-only" import guard.

import { Pool } from "pg";
import "dotenv/config";

let _pool: Pool | undefined;

export function pgPool(): Pool {
  if (!_pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set (check .env.local)");
    _pool = new Pool({
      connectionString: url,
      ssl: url.includes("supabase.co") ? { rejectUnauthorized: false } : false,
      max: 4,
    });
  }
  return _pool;
}

export async function endPgPool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = undefined;
  }
}
