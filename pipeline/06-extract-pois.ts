// Step 6: extract POIs along each route — restaurants, cafes, viewpoints, peaks
// within ~200m of the polyline.
//
// We do one Overpass query per region (covering all POI candidates in the bbox)
// and then assign each POI to whichever route polylines pass within 200m using
// PostGIS ST_DWithin.

import pLimit from "p-limit";
import type { PoiKind } from "../lib/types";
import { overpass, poiQuery } from "./lib/overpass";
import type { RegionConfig } from "./lib/region";
import { pgPool } from "./lib/db";
import { log, progress } from "./lib/log";

const BUFFER_METERS = 200;

export async function extractPois(cfg: RegionConfig): Promise<void> {
  const client = pgPool();
  const concurrency = Number(process.env.PIPELINE_CONCURRENCY ?? 10);
  const limit = pLimit(concurrency);

  log("pois", "fetching POIs via Overpass...");
  const poiData = await overpass(poiQuery(cfg.bbox));
  const candidates = poiData.elements
    .map((el) => {
      if (el.type !== "node" || el.lat === undefined || el.lon === undefined) return null;
      const tags = el.tags ?? {};
      const kind = poiKind(tags);
      if (!kind) return null;
      return {
        osmId: `node/${el.id}`,
        lat: el.lat,
        lon: el.lon,
        kind,
        name: tags.name ?? null,
      };
    })
    .filter(<T,>(x: T): x is NonNullable<T> => x !== null);
  log("pois", `${candidates.length} candidate POIs in region (concurrency=${concurrency})`);

  // For each POI, find every route in the region that passes within BUFFER_METERS,
  // then insert one (route_id, osm_id) row per match. All POIs run concurrently;
  // each POI's matching routes still insert sequentially so we never exceed the
  // pool with N×M rows in flight.
  const keptKeys = new Set<string>();
  let completed = 0;

  await Promise.all(
    candidates.map((p) =>
      limit(async () => {
        const { rows } = await client.query<{ id: string }>(
          `select id from routes
            where region_slug = $1
              and st_dwithin(polyline, st_setsrid(st_makepoint($2, $3), 4326)::geography, $4)`,
          [cfg.slug, p.lon, p.lat, BUFFER_METERS]
        );
        for (const r of rows) {
          await client.query(
            `insert into pois (region_slug, route_id, osm_id, geog, kind, name)
             values ($1, $2, $3, st_setsrid(st_makepoint($4, $5), 4326)::geography, $6, $7)
             on conflict (route_id, osm_id) do update
               set geog = excluded.geog, kind = excluded.kind, name = excluded.name`,
            [cfg.slug, r.id, p.osmId, p.lon, p.lat, p.kind, p.name]
          );
          keptKeys.add(`${r.id}|${p.osmId}`);
        }
        completed++;
        if (completed % 50 === 0 || completed === candidates.length) {
          progress("pois", completed, candidates.length);
        }
      })
    )
  );

  // Drop POIs no longer paired with any route in this run.
  const { rowCount } = await client.query(
    `delete from pois where region_slug = $1
       and (route_id::text || '|' || osm_id) <> all($2::text[])`,
    [cfg.slug, [...keptKeys]]
  );
  log("pois", `dropped ${rowCount ?? 0} stale poi rows`);
  log("pois", `done — ${keptKeys.size} POI/route pairings`);
}

function poiKind(tags: Record<string, string>): PoiKind | null {
  if (tags.amenity === "restaurant") return "restaurant";
  if (tags.amenity === "cafe") return "cafe";
  if (tags.tourism === "viewpoint") return "viewpoint";
  if (tags.natural === "peak") return "peak";
  return null;
}
