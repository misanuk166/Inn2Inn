// Step 4: compute pre-computed foot routes between every pair of lodging in
// this region that are within ~10 mi of each other (great-circle, then verified
// against the actual foot-route distance from OSRM).
//
// For v1 we hit a hosted OSRM endpoint (default: project-osrm.org demo). For
// production at US scale, point OSRM_URL at a self-hosted instance built from
// the region's PBF — see pipeline/README.md.

import type { LngLat } from "../lib/types";
import { makeOsrmClient, DEFAULT_OSRM_URL } from "../lib/routing";
import { lookupElevations } from "./lib/elevation";
import type { RegionConfig } from "./lib/region";
import { pgPool } from "./lib/db";
import { log, progress } from "./lib/log";

interface Hotel {
  id: string;
  lat: number;
  lon: number;
}

const SAMPLES_PER_ROUTE = 30; // elevation samples along each polyline

export async function computeRoutes(cfg: RegionConfig): Promise<number> {
  const client = pgPool();

  // Pull all lodging in the region (id + coords).
  const { rows: hotels } = await client.query<Hotel>(
    `select id, st_y(geog::geometry) as lat, st_x(geog::geometry) as lon
       from lodging where region_slug = $1 order by id`,
    [cfg.slug]
  );
  log("routes", `${hotels.length} lodgings to pair`);

  // For each hotel, find k-nearest neighbors within maxRouteMiles.
  // Use PostGIS ST_DWithin on geography for an accurate spherical distance.
  const maxMeters = cfg.maxRouteMiles * 1609.344;
  const candidatePairs = new Set<string>();
  for (const h of hotels) {
    const { rows: neighbors } = await client.query<{ id: string }>(
      `select id from lodging
        where region_slug = $1
          and id <> $2
          and st_dwithin(geog, (select geog from lodging where id = $2), $3)
        order by geog <-> (select geog from lodging where id = $2)
        limit 12`,
      [cfg.slug, h.id, maxMeters]
    );
    for (const n of neighbors) {
      const [a, b] = h.id < n.id ? [h.id, n.id] : [n.id, h.id];
      candidatePairs.add(`${a}|${b}`);
    }
  }
  log("routes", `${candidatePairs.size} candidate pairs (k-nearest within ${cfg.maxRouteMiles} mi)`);

  const osrm = makeOsrmClient(DEFAULT_OSRM_URL);
  const hotelById = new Map(hotels.map((h) => [h.id, h]));
  const keptIds = new Set<string>();
  let i = 0;

  for (const pairKey of candidatePairs) {
    i++;
    const [aId, bId] = pairKey.split("|");
    const a = hotelById.get(aId)!;
    const b = hotelById.get(bId)!;

    let osrmResult;
    try {
      osrmResult = await osrm.route([a.lon, a.lat], [b.lon, b.lat]);
    } catch (e) {
      log("routes", `osrm error for ${aId}↔${bId}: ${(e as Error).message}`);
      continue;
    }
    if (!osrmResult || osrmResult.distanceMi > cfg.maxRouteMiles) {
      continue;
    }

    // Sample elevations along the polyline.
    const samplePoints = sampleAlong(osrmResult.geometry.coordinates as LngLat[], SAMPLES_PER_ROUTE);
    const elevsMeters = await lookupElevations(samplePoints);
    const elevsFt = elevsMeters.map((m) => Math.round(m * 3.28084));
    let gain = 0;
    let loss = 0;
    for (let j = 1; j < elevsFt.length; j++) {
      const d = elevsFt[j] - elevsFt[j - 1];
      if (d > 0) gain += d;
      else loss += -d;
    }
    const totalMi = osrmResult.distanceMi;
    const profile = elevsFt.map((elev, j) => ({
      distMi: (j / (elevsFt.length - 1)) * totalMi,
      elevFt: elev,
    }));

    // Build a LineString WKT from the OSRM geometry for ST_GeogFromText.
    const lineWkt =
      "LINESTRING(" +
      osrmResult.geometry.coordinates.map(([lon, lat]) => `${lon} ${lat}`).join(", ") +
      ")";

    const insertResult = await client.query<{ id: string }>(
      `insert into routes
         (region_slug, a_id, b_id, distance_mi, duration_min, gain_ft, loss_ft,
          polyline, elevation_profile, scenic_score, sub_scores, category)
       values ($1, $2, $3, $4, $5, $6, $7,
               st_geogfromtext($8), $9, 0, '{}'::jsonb, 'urban_road')
       on conflict (a_id, b_id) do update
         set distance_mi = excluded.distance_mi,
             duration_min = excluded.duration_min,
             gain_ft = excluded.gain_ft,
             loss_ft = excluded.loss_ft,
             polyline = excluded.polyline,
             elevation_profile = excluded.elevation_profile
       returning id`,
      [
        cfg.slug,
        aId,
        bId,
        totalMi.toFixed(2),
        Math.round(osrmResult.durationMin),
        gain,
        loss,
        lineWkt,
        JSON.stringify(profile),
      ]
    );
    keptIds.add(insertResult.rows[0].id);

    if (i % 10 === 0 || i === candidatePairs.size) {
      progress("routes", i, candidatePairs.size, `kept ${keptIds.size}`);
    }
  }

  // Drop routes that didn't survive this run.
  const { rowCount } = await client.query(
    `delete from routes where region_slug = $1 and id <> all($2::uuid[])`,
    [cfg.slug, [...keptIds]]
  );
  log("routes", `dropped ${rowCount ?? 0} stale routes`);
  log("routes", `done — ${keptIds.size} routes kept`);
  return keptIds.size;
}

function sampleAlong(coords: LngLat[], n: number): LngLat[] {
  if (coords.length <= n) return coords;
  const out: LngLat[] = [];
  const step = (coords.length - 1) / (n - 1);
  for (let i = 0; i < n; i++) {
    out.push(coords[Math.round(i * step)]);
  }
  return out;
}
