// Step 5: compute scenic scores for every route in the region.
//
// Inputs we need per route:
//   - fractionInNatural    (% of polyline length within natural-area polygons)
//   - fractionOnMajorRoad  (% within major-road buffer)
//   - fractionTrail / fractionMinor / fractionMajor  (highway category mix)
//   - fractionNearWater    (% within 500m of water/coast)
//   - distanceMi, gainFt, lossFt (already on the row)
//
// We pull all the relevant OSM features once via Overpass for the region's
// bbox, build PostGIS scratch tables, and run spatial joins per route.

import type { LngLat } from "../lib/types";
import {
  scoreNaturalness,
  scoreElevation,
  scoreWater,
  scoreSurface,
  scoreDistance,
  totalScore,
  categorize,
} from "../lib/scoring";
import { overpass, featureQuery } from "./lib/overpass";
import type { RegionConfig } from "./lib/region";
import { pgPool } from "./lib/db";
import { log, progress } from "./lib/log";

const NATURAL_LANDUSE = new Set(["forest", "meadow", "grass"]);
const NATURAL_NATURAL = new Set(["wood", "water"]);
const NATURAL_LEISURE = new Set(["park", "nature_reserve"]);
const TRAIL_HIGHWAYS = new Set(["path", "track", "footway", "bridleway", "steps"]);
const MINOR_HIGHWAYS = new Set([
  "service",
  "residential",
  "unclassified",
  "living_street",
  "pedestrian",
  "cycleway",
]);
const MAJOR_HIGHWAYS = new Set([
  "motorway",
  "trunk",
  "primary",
  "secondary",
  "tertiary",
]);

const SCRATCH_HIGHWAYS = "_pipeline_scratch_highways";
const SCRATCH_NATURAL = "_pipeline_scratch_natural";
const SCRATCH_WATER = "_pipeline_scratch_water";

export async function scoreRoutes(cfg: RegionConfig): Promise<void> {
  const client = pgPool();

  log("scoring", "fetching OSM feature corridors via Overpass...");
  const features = await overpass(featureQuery(cfg.bbox));
  log("scoring", `Overpass returned ${features.elements.length} features`);

  // Build scratch tables (truncated each run).
  await client.query(`drop table if exists ${SCRATCH_HIGHWAYS}`);
  await client.query(`drop table if exists ${SCRATCH_NATURAL}`);
  await client.query(`drop table if exists ${SCRATCH_WATER}`);
  await client.query(
    `create table ${SCRATCH_HIGHWAYS} (kind text not null, geog geography(LineString,4326) not null)`
  );
  await client.query(
    `create table ${SCRATCH_NATURAL} (geog geography(Polygon,4326) not null)`
  );
  await client.query(
    `create table ${SCRATCH_WATER} (geog geography not null)`
  );
  await client.query(`create index on ${SCRATCH_HIGHWAYS} using gist (geog)`);
  await client.query(`create index on ${SCRATCH_NATURAL} using gist (geog)`);
  await client.query(`create index on ${SCRATCH_WATER} using gist (geog)`);

  let highways = 0,
    naturals = 0,
    waters = 0;

  for (const el of features.elements) {
    if (el.type !== "way" || !el.geometry || el.geometry.length < 2 || !el.tags) continue;
    const coords: LngLat[] = el.geometry.map((p) => [p.lon, p.lat]);
    if (el.tags.highway) {
      const kind = highwayKind(el.tags.highway);
      if (!kind) continue;
      const wkt = lineWkt(coords);
      await client.query(
        `insert into ${SCRATCH_HIGHWAYS} (kind, geog) values ($1, st_geogfromtext($2))`,
        [kind, wkt]
      );
      highways++;
    } else if (
      el.tags.natural === "water" ||
      el.tags.natural === "coastline" ||
      el.tags.landuse === "reservoir"
    ) {
      // Treat water/coast as a generic geography (line or polygon depending on tags).
      const isClosed =
        coords.length > 2 &&
        coords[0][0] === coords[coords.length - 1][0] &&
        coords[0][1] === coords[coords.length - 1][1];
      const wkt = isClosed ? polyWkt(coords) : lineWkt(coords);
      try {
        await client.query(
          `insert into ${SCRATCH_WATER} (geog) values (st_geogfromtext($1))`,
          [wkt]
        );
        waters++;
      } catch {
        /* skip invalid geometries */
      }
    } else if (
      (el.tags.landuse && NATURAL_LANDUSE.has(el.tags.landuse)) ||
      (el.tags.natural && NATURAL_NATURAL.has(el.tags.natural)) ||
      (el.tags.leisure && NATURAL_LEISURE.has(el.tags.leisure)) ||
      el.tags.boundary === "protected_area"
    ) {
      const isClosed =
        coords.length > 2 &&
        coords[0][0] === coords[coords.length - 1][0] &&
        coords[0][1] === coords[coords.length - 1][1];
      if (!isClosed) continue;
      try {
        await client.query(
          `insert into ${SCRATCH_NATURAL} (geog) values (st_geogfromtext($1))`,
          [polyWkt(coords)]
        );
        naturals++;
      } catch {
        /* skip invalid geometries */
      }
    }
  }
  log("scoring", `loaded ${highways} highways / ${naturals} natural polys / ${waters} water features`);

  // Score each route.
  const { rows: routes } = await client.query<{
    id: string;
    distance_mi: string;
    gain_ft: number;
    loss_ft: number;
    polyline_length_m: number;
    f_in_natural: number;
    f_trail: number;
    f_minor: number;
    f_major: number;
    f_near_water: number;
  }>(
    `with r as (
       select id, distance_mi, gain_ft, loss_ft,
              polyline,
              st_length(polyline) as polyline_length_m
         from routes where region_slug = $1
     )
     select r.id, r.distance_mi, r.gain_ft, r.loss_ft, r.polyline_length_m,
       coalesce((
         select sum(st_length(st_intersection(r.polyline::geometry, n.geog::geometry)::geography))
           from ${SCRATCH_NATURAL} n
          where r.polyline && n.geog
       ), 0) / nullif(r.polyline_length_m, 0) as f_in_natural,
       coalesce((
         select sum(st_length(st_intersection(r.polyline::geometry, h.geog::geometry)::geography))
           from ${SCRATCH_HIGHWAYS} h
          where r.polyline && h.geog and h.kind = 'trail'
       ), 0) / nullif(r.polyline_length_m, 0) as f_trail,
       coalesce((
         select sum(st_length(st_intersection(r.polyline::geometry, h.geog::geometry)::geography))
           from ${SCRATCH_HIGHWAYS} h
          where r.polyline && h.geog and h.kind = 'minor'
       ), 0) / nullif(r.polyline_length_m, 0) as f_minor,
       coalesce((
         select sum(st_length(st_intersection(r.polyline::geometry, h.geog::geometry)::geography))
           from ${SCRATCH_HIGHWAYS} h
          where r.polyline && h.geog and h.kind = 'major'
       ), 0) / nullif(r.polyline_length_m, 0) as f_major,
       coalesce((
         select sum(st_length(st_intersection(r.polyline::geometry,
                       st_buffer(w.geog, 500)::geometry)::geography))
           from ${SCRATCH_WATER} w
          where r.polyline && st_buffer(w.geog, 500)
       ), 0) / nullif(r.polyline_length_m, 0) as f_near_water
     from r`,
    [cfg.slug]
  );

  log("scoring", `scoring ${routes.length} routes...`);

  let i = 0;
  for (const r of routes) {
    i++;
    const sub = {
      naturalness: scoreNaturalness({
        fractionInNatural: clamp01(Number(r.f_in_natural)),
        fractionOnMajorRoad: clamp01(Number(r.f_major)),
      }),
      elevation: scoreElevation({ gainFt: r.gain_ft, lossFt: r.loss_ft }),
      water: scoreWater({ fractionNearWater: clamp01(Number(r.f_near_water)) }),
      surface: scoreSurface({
        fractionTrail: clamp01(Number(r.f_trail)),
        fractionMinor: clamp01(Number(r.f_minor)),
        fractionMajor: clamp01(Number(r.f_major)),
      }),
      distance: scoreDistance({ distanceMi: Number(r.distance_mi) }),
    };
    const total = totalScore(sub);
    const cat = categorize(total);
    await client.query(
      `update routes set scenic_score = $2, sub_scores = $3, category = $4 where id = $1`,
      [r.id, total, JSON.stringify(sub), cat]
    );
    if (i % 25 === 0 || i === routes.length) {
      progress("scoring", i, routes.length);
    }
  }

  // Drop scratch tables — they're regenerated each run.
  await client.query(`drop table ${SCRATCH_HIGHWAYS}`);
  await client.query(`drop table ${SCRATCH_NATURAL}`);
  await client.query(`drop table ${SCRATCH_WATER}`);
  log("scoring", "done");
}

function highwayKind(tag: string): "trail" | "minor" | "major" | null {
  if (TRAIL_HIGHWAYS.has(tag)) return "trail";
  if (MINOR_HIGHWAYS.has(tag)) return "minor";
  if (MAJOR_HIGHWAYS.has(tag)) return "major";
  return null;
}

function clamp01(n: number): number {
  if (Number.isNaN(n) || !isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function lineWkt(coords: LngLat[]): string {
  return "LINESTRING(" + coords.map(([lon, lat]) => `${lon} ${lat}`).join(", ") + ")";
}

function polyWkt(coords: LngLat[]): string {
  return "POLYGON((" + coords.map(([lon, lat]) => `${lon} ${lat}`).join(", ") + "))";
}
