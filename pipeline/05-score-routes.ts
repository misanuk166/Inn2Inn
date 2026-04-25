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

const NATURAL_LANDUSE = new Set(["forest", "meadow", "grass", "recreation_ground"]);
const NATURAL_NATURAL = new Set(["wood", "water", "scrub", "heath", "grassland"]);
const NATURAL_LEISURE = new Set(["park", "nature_reserve", "golf_course"]);
const NATURAL_BOUNDARY = new Set(["protected_area", "national_park"]);
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

  // Bucket features in memory, then bulk-insert in batches. One round-trip per
  // batch is ~1000x faster than one round-trip per feature against the pooler.
  const highwayRows: Array<{ kind: string; wkt: string }> = [];
  const naturalRows: string[] = []; // wkt
  const waterRows: string[] = [];   // wkt

  function isNaturalTagged(tags: Record<string, string>): boolean {
    return (
      (!!tags.landuse && NATURAL_LANDUSE.has(tags.landuse)) ||
      (!!tags.natural && NATURAL_NATURAL.has(tags.natural)) ||
      (!!tags.leisure && NATURAL_LEISURE.has(tags.leisure)) ||
      (!!tags.boundary && NATURAL_BOUNDARY.has(tags.boundary))
    );
  }

  // Per-relation collection of outer-way line segments. We assemble them
  // into a single convex-hull polygon per relation later — that's a valid
  // polygon and a reasonable approximation of "is the route inside this
  // park?" for parks like Mt Tamalpais SP that are roughly convex.
  const relationOuters = new Map<string, string[]>(); // relId -> array of LineString WKTs

  function addOuter(relId: string, coords: LngLat[]) {
    if (coords.length < 2) return;
    const list = relationOuters.get(relId) ?? [];
    list.push(lineWkt(coords));
    relationOuters.set(relId, list);
  }

  for (const el of features.elements) {
    const tags = el.tags ?? {};

    if (el.type === "way" && el.geometry && el.geometry.length >= 2) {
      const coords: LngLat[] = el.geometry.map((p) => [p.lon, p.lat]);
      const isClosed =
        coords.length > 2 &&
        coords[0][0] === coords[coords.length - 1][0] &&
        coords[0][1] === coords[coords.length - 1][1];

      if (tags.highway) {
        const kind = highwayKind(tags.highway);
        if (!kind) continue;
        highwayRows.push({ kind, wkt: lineWkt(coords) });
      } else if (
        tags.natural === "water" ||
        tags.natural === "coastline" ||
        tags.landuse === "reservoir"
      ) {
        waterRows.push(isClosed ? polyWkt(coords) : lineWkt(coords));
      } else if (isNaturalTagged(tags) && isClosed) {
        naturalRows.push(polyWkt(coords));
      }
    } else if (el.type === "relation" && isNaturalTagged(tags)) {
      // Multipolygon: outer member ways form the park boundary. Collect the
      // line segments now, build one convex-hull polygon per relation later.
      const members = (el as unknown as {
        members?: Array<{
          type: string;
          role?: string;
          geometry?: Array<{ lat: number; lon: number }>;
        }>;
      }).members;
      if (!members) continue;
      const relId = `rel/${el.id}`;
      for (const mem of members) {
        if (mem.type !== "way" || !mem.geometry || mem.geometry.length < 2) continue;
        if (mem.role && mem.role !== "outer" && mem.role !== "") continue;
        const coords: LngLat[] = mem.geometry.map((p) => [p.lon, p.lat]);
        addOuter(relId, coords);
      }
    }
  }

  log("scoring", `bulk-loading ${highwayRows.length} highways...`);
  await bulkInsertHighways(highwayRows);
  log("scoring", `bulk-loading ${naturalRows.length} natural polys (from closed ways)...`);
  await bulkInsertGeoms(SCRATCH_NATURAL, naturalRows);
  log("scoring", `assembling ${relationOuters.size} natural polys from relation outers...`);
  await assembleRelationPolygons();
  log("scoring", `bulk-loading ${waterRows.length} water features...`);
  await bulkInsertGeoms(SCRATCH_WATER, waterRows);

  // Count what landed.
  const { rows: counts } = await client.query<{ c: string }>(
    `select count(*)::text as c from ${SCRATCH_NATURAL}`
  );
  log("scoring", `loaded ${highwayRows.length} highways / ${counts[0].c} natural polys / ${waterRows.length} water features`);

  async function assembleRelationPolygons(): Promise<void> {
    // For each relation, take ST_ConvexHull(ST_Collect(...)) of all its
    // outer way line segments. Convex hull is always a valid polygon and is
    // a fine approximation of "is the route inside this park?" for the kinds
    // of natural areas we care about (parks, protected areas, forests).
    let attempted = 0;
    let inserted = 0;
    for (const [, lines] of relationOuters.entries()) {
      attempted++;
      if (lines.length === 0) continue;
      try {
        await client.query(
          `insert into ${SCRATCH_NATURAL} (geog)
           select st_convexhull(st_collect(g))::geography
             from (
               select st_geogfromtext(unnest($1::text[]))::geometry as g
             ) s
           having st_geometrytype(st_convexhull(st_collect(g))) = 'ST_Polygon'`,
          [lines]
        );
        inserted++;
      } catch {
        // Skip this relation if its lines can't form a polygon.
      }
    }
    log("scoring", `relation polygons: ${inserted}/${attempted} assembled`);
  }

  // Single-array-parameter bulk insert via UNNEST. The whole batch travels as
  // one or two text[] parameters (no per-row placeholders), so the pooler sees
  // a tiny statement regardless of batch size. ST_GeogFromText is wrapped in a
  // try/catch via a CTE so a single bad geometry doesn't kill the batch.
  async function bulkInsertHighways(rows: Array<{ kind: string; wkt: string }>): Promise<void> {
    if (rows.length === 0) return;
    const BATCH = 2000;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const kinds = batch.map((r) => r.kind);
      const wkts = batch.map((r) => r.wkt);
      await client.query(
        `insert into ${SCRATCH_HIGHWAYS} (kind, geog)
         select k, st_geogfromtext(w)
           from unnest($1::text[], $2::text[]) as t(k, w)`,
        [kinds, wkts]
      );
      progress("scoring", Math.min(i + BATCH, rows.length), rows.length, "highways");
    }
  }

  async function bulkInsertGeoms(table: string, wkts: string[]): Promise<void> {
    if (wkts.length === 0) return;
    const BATCH = 2000;
    for (let i = 0; i < wkts.length; i += BATCH) {
      const batch = wkts.slice(i, i + BATCH);
      try {
        await client.query(
          `insert into ${table} (geog)
           select st_geogfromtext(w) from unnest($1::text[]) as t(w)`,
          [batch]
        );
      } catch {
        // Fall back to per-row when the batch contains a malformed geometry.
        for (const w of batch) {
          try {
            await client.query(
              `insert into ${table} (geog) values (st_geogfromtext($1))`,
              [w]
            );
          } catch {
            /* skip invalid */
          }
        }
      }
      progress("scoring", Math.min(i + BATCH, wkts.length), wkts.length, table);
    }
  }

  // Help the planner pick the GIST indexes on the freshly-loaded scratch tables.
  await client.query(`analyze ${SCRATCH_HIGHWAYS}`);
  await client.query(`analyze ${SCRATCH_NATURAL}`);
  await client.query(`analyze ${SCRATCH_WATER}`);

  // Bump statement timeout for this connection — the per-route spatial joins
  // are individually fast but Supabase's default is short.
  await client.query(`set statement_timeout = '120s'`);

  // Pull just the route ids; score one at a time so each statement stays
  // under the timeout.
  const { rows: routes } = await client.query<{
    id: string;
    distance_mi: string;
    gain_ft: number;
    loss_ft: number;
  }>(
    `select id, distance_mi, gain_ft, loss_ft
       from routes where region_slug = $1`,
    [cfg.slug]
  );
  log("scoring", `scoring ${routes.length} routes...`);

  let i = 0;
  let failed = 0;
  for (const r of routes) {
    i++;
    let fr: Array<{
      polyline_length_m: number;
      f_in_natural: number;
      f_trail: number;
      f_minor: number;
      f_major: number;
      f_near_water: number;
    }> = [];
    try {
      const res = await client.query<{
        polyline_length_m: number;
        f_in_natural: number;
        f_trail: number;
        f_minor: number;
        f_major: number;
        f_near_water: number;
      }>(
      // For surface: two LineStrings representing the same real-world trail
      // rarely overlap pixel-perfectly, so a raw ST_Intersection(line, line)
      // returns ~0. Buffer the highway by 30m (real-world "corridor" of the
      // same physical path) and then clip the route against it — the result
      // is the portion of the route that's within 30m of a highway of that
      // category, which is what we actually want to measure.
      //
      // For naturalness: route-vs-polygon ST_Intersection is meaningful
      // (line inside polygon returns the inside portion).
      //
      // For water: "within 500m of water" corridor via ST_DWithin.
      `with r as (
         select polyline, st_length(polyline) as polyline_length_m
           from routes where id = $1
       )
       select r.polyline_length_m,
         coalesce((
           select sum(st_length(st_intersection(
             r.polyline::geometry,
             st_makevalid(n.geog::geometry)
           )::geography))
             from ${SCRATCH_NATURAL} n where r.polyline && n.geog
         ), 0) / nullif(r.polyline_length_m, 0) as f_in_natural,
         coalesce((
           select sum(st_length(st_intersection(
             r.polyline::geometry,
             st_buffer(h.geog, 30)::geometry
           )::geography))
             from ${SCRATCH_HIGHWAYS} h
            where h.kind = 'trail' and st_dwithin(r.polyline, h.geog, 30)
         ), 0) / nullif(r.polyline_length_m, 0) as f_trail,
         coalesce((
           select sum(st_length(st_intersection(
             r.polyline::geometry,
             st_buffer(h.geog, 30)::geometry
           )::geography))
             from ${SCRATCH_HIGHWAYS} h
            where h.kind = 'minor' and st_dwithin(r.polyline, h.geog, 30)
         ), 0) / nullif(r.polyline_length_m, 0) as f_minor,
         coalesce((
           select sum(st_length(st_intersection(
             r.polyline::geometry,
             st_buffer(h.geog, 30)::geometry
           )::geography))
             from ${SCRATCH_HIGHWAYS} h
            where h.kind = 'major' and st_dwithin(r.polyline, h.geog, 30)
         ), 0) / nullif(r.polyline_length_m, 0) as f_major,
         coalesce((
           select sum(st_length(st_intersection(
             r.polyline::geometry,
             st_buffer(w.geog, 500)::geometry
           )::geography))
             from ${SCRATCH_WATER} w where st_dwithin(r.polyline, w.geog, 500)
         ), 0) / nullif(r.polyline_length_m, 0) as f_near_water
       from r`,
        [r.id]
      );
      fr = res.rows;
    } catch (e) {
      failed++;
      log("scoring", `route ${r.id} failed: ${(e as Error).message.slice(0, 100)}`);
    }
    const f = fr[0] ?? {
      polyline_length_m: 0,
      f_in_natural: 0,
      f_trail: 0,
      f_minor: 0,
      f_major: 0,
      f_near_water: 0,
    };
    const sub = {
      naturalness: scoreNaturalness({
        fractionInNatural: clamp01(Number(f.f_in_natural)),
        fractionOnMajorRoad: clamp01(Number(f.f_major)),
      }),
      elevation: scoreElevation({ gainFt: r.gain_ft, lossFt: r.loss_ft }),
      water: scoreWater({ fractionNearWater: clamp01(Number(f.f_near_water)) }),
      surface: scoreSurface({
        fractionTrail: clamp01(Number(f.f_trail)),
        fractionMinor: clamp01(Number(f.f_minor)),
        fractionMajor: clamp01(Number(f.f_major)),
      }),
      distance: scoreDistance({ distanceMi: Number(r.distance_mi) }),
    };
    const total = totalScore(sub);
    const cat = categorize(total);
    try {
      await client.query(
        `update routes set scenic_score = $2, sub_scores = $3, category = $4 where id = $1`,
        [r.id, total, JSON.stringify(sub), cat]
      );
    } catch (e) {
      failed++;
      log("scoring", `route ${r.id} update failed: ${(e as Error).message.slice(0, 100)}`);
    }
    if (i % 25 === 0 || i === routes.length) {
      progress("scoring", i, routes.length, "scored");
    }
  }

  // Drop scratch tables — they're regenerated each run.
  await client.query(`drop table ${SCRATCH_HIGHWAYS}`);
  await client.query(`drop table ${SCRATCH_NATURAL}`);
  await client.query(`drop table ${SCRATCH_WATER}`);
  log("scoring", `done (${failed} route(s) failed spatial join — scored as 0)`);
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
