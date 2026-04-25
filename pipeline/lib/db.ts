// Pipeline-side Postgres client. Distinct from lib/db.ts (which is server-only
// for the Next.js app) so we can use it from plain Node scripts without
// hitting the "server-only" import guard.

import { Pool } from "pg";
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

// Load .env.local first (Next.js convention), then fall back to .env.
loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv();

let _pool: Pool | undefined;

export function pgPool(): Pool {
  if (!_pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set (check .env.local)");
    _pool = new Pool({
      connectionString: url,
      ssl: url.includes("supabase.co") ? { rejectUnauthorized: false } : false,
      // Sized for the concurrent route-insert workload in 04-compute-routes.ts.
      // Supabase's session pooler caps connections per project; 15 is a
      // comfortable headroom under the default cap.
      max: 15,
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
