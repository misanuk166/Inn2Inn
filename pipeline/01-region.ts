// Step 1: ensure the region row exists in Postgres and is marked 'building'.
// (Replaces the earlier "fetch OSM PBF" step — we use Overpass directly for v1
// instead of running osmium/Docker. The PBF/OSRM-self-hosting path is
// documented in pipeline/README.md for production use.)

import type { RegionConfig } from "./lib/region";
import { pgPool } from "./lib/db";
import { log } from "./lib/log";

export async function upsertRegion(cfg: RegionConfig): Promise<void> {
  const [w, s, e, n] = cfg.bbox;
  const polygon = `POLYGON((${w} ${s}, ${e} ${s}, ${e} ${n}, ${w} ${n}, ${w} ${s}))`;
  await pgPool().query(
    `insert into regions (slug, name, bbox, status)
     values ($1, $2, st_geomfromtext($3, 4326), 'building')
     on conflict (slug) do update
       set name = excluded.name,
           bbox = excluded.bbox,
           status = 'building',
           updated_at = now()`,
    [cfg.slug, cfg.name, polygon]
  );
  log("region", `upserted ${cfg.slug} (status=building)`);
}

export async function markRegionReady(slug: string, routesCount: number): Promise<void> {
  await pgPool().query(
    `update regions
        set status = 'ready', routes_count = $2, updated_at = now()
      where slug = $1`,
    [slug, routesCount]
  );
  log("region", `marked ${slug} ready (${routesCount} routes)`);
}
