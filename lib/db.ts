// Server-only Postgres helpers.
// Use the pg driver directly for queries that benefit from PostGIS expressions
// (k-nearest, ST_DWithin, ST_AsGeoJSON). The Supabase client is used for auth
// and for tables we don't need PostGIS-aware queries on (itineraries).

import "server-only";
import { Pool } from "pg";
import type { Bbox, Lodging, Poi, Region, Route } from "./types";

let _pool: Pool | undefined;

function pool(): Pool {
  if (!_pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    _pool = new Pool({
      connectionString: url,
      // Supabase requires SSL in production; allow plain for local supabase-cli
      ssl: url.includes("supabase.co") ? { rejectUnauthorized: false } : false,
      max: 5,
    });
  }
  return _pool;
}

export async function listRegions(): Promise<Region[]> {
  const { rows } = await pool().query<{
    slug: string;
    name: string;
    bbox: string;
    status: Region["status"];
    routes_count: number;
  }>(
    `select slug, name, st_asgeojson(bbox) as bbox, status, routes_count
       from regions
      order by name`
  );
  return rows.map((r) => {
    const geom = JSON.parse(r.bbox) as { coordinates: number[][][] };
    const ring = geom.coordinates[0];
    const xs = ring.map((p) => p[0]);
    const ys = ring.map((p) => p[1]);
    const bbox: Bbox = [
      Math.min(...xs),
      Math.min(...ys),
      Math.max(...xs),
      Math.max(...ys),
    ];
    return {
      slug: r.slug,
      name: r.name,
      bbox,
      status: r.status,
      routesCount: r.routes_count,
    };
  });
}

export async function getRegion(slug: string): Promise<Region | null> {
  const all = await listRegions();
  return all.find((r) => r.slug === slug) ?? null;
}

interface LodgingRow {
  id: string;
  region_slug: string;
  source_id: string;
  name: string;
  type: string;
  lon: number;
  lat: number;
  city: string | null;
  state: string | null;
  address: string | null;
  elevation_ft: number | null;
  price_range: string | null;
  description: string | null;
  photo_url: string | null;
  website: string | null;
}

function lodgingFromRow(r: LodgingRow): Lodging {
  return {
    id: r.id,
    regionSlug: r.region_slug,
    sourceId: r.source_id,
    name: r.name,
    type: r.type as Lodging["type"],
    lat: Number(r.lat),
    lon: Number(r.lon),
    city: r.city,
    state: r.state,
    address: r.address,
    elevationFt: r.elevation_ft,
    priceRange: r.price_range,
    description: r.description,
    photoUrl: r.photo_url,
    website: r.website,
  };
}

const LODGING_COLS = `id, region_slug, source_id, name, type,
  st_x(geog::geometry) as lon, st_y(geog::geometry) as lat,
  city, state, address, elevation_ft, price_range, description, photo_url, website`;

export async function getLodgingByRegion(regionSlug: string): Promise<Lodging[]> {
  const { rows } = await pool().query<LodgingRow>(
    `select ${LODGING_COLS} from lodging where region_slug = $1 order by name`,
    [regionSlug]
  );
  return rows.map(lodgingFromRow);
}

export async function getLodgingByBbox(bbox: Bbox): Promise<Lodging[]> {
  const [w, s, e, n] = bbox;
  const { rows } = await pool().query<LodgingRow>(
    `select ${LODGING_COLS} from lodging
      where geog && st_makeenvelope($1, $2, $3, $4, 4326)::geography`,
    [w, s, e, n]
  );
  return rows.map(lodgingFromRow);
}

export async function getLodgingById(id: string): Promise<Lodging | null> {
  const { rows } = await pool().query<LodgingRow>(
    `select ${LODGING_COLS} from lodging where id = $1`,
    [id]
  );
  return rows[0] ? lodgingFromRow(rows[0]) : null;
}

interface RouteRow {
  id: string;
  region_slug: string;
  a_id: string;
  b_id: string;
  distance_mi: string;
  duration_min: number;
  gain_ft: number;
  loss_ft: number;
  polyline: string;
  elevation_profile: Route["elevationProfile"];
  scenic_score: number;
  sub_scores: Route["subScores"];
  category: Route["category"];
}

function routeFromRow(r: RouteRow): Route {
  return {
    id: r.id,
    regionSlug: r.region_slug,
    aId: r.a_id,
    bId: r.b_id,
    distanceMi: Number(r.distance_mi),
    durationMin: r.duration_min,
    gainFt: r.gain_ft,
    lossFt: r.loss_ft,
    polyline: JSON.parse(r.polyline),
    elevationProfile: r.elevation_profile,
    scenicScore: r.scenic_score,
    subScores: r.sub_scores,
    category: r.category,
  };
}

const ROUTE_COLS = `id, region_slug, a_id, b_id, distance_mi, duration_min,
  gain_ft, loss_ft, st_asgeojson(polyline) as polyline,
  elevation_profile, scenic_score, sub_scores, category`;

export async function getRoutesByRegion(regionSlug: string): Promise<Route[]> {
  const { rows } = await pool().query<RouteRow>(
    `select ${ROUTE_COLS} from routes where region_slug = $1 order by scenic_score desc`,
    [regionSlug]
  );
  return rows.map(routeFromRow);
}

export async function getRoutesByBbox(bbox: Bbox): Promise<Route[]> {
  const [w, s, e, n] = bbox;
  const { rows } = await pool().query<RouteRow>(
    `select ${ROUTE_COLS} from routes
      where polyline && st_makeenvelope($1, $2, $3, $4, 4326)::geography
      order by scenic_score desc
      limit 2000`,
    [w, s, e, n]
  );
  return rows.map(routeFromRow);
}

export async function getRouteById(id: string): Promise<Route | null> {
  const { rows } = await pool().query<RouteRow>(
    `select ${ROUTE_COLS} from routes where id = $1`,
    [id]
  );
  return rows[0] ? routeFromRow(rows[0]) : null;
}

export async function getRoutesForHotel(hotelId: string, limit = 3): Promise<Route[]> {
  const { rows } = await pool().query<RouteRow>(
    `select ${ROUTE_COLS} from routes
      where a_id = $1 or b_id = $1
      order by scenic_score desc
      limit $2`,
    [hotelId, limit]
  );
  return rows.map(routeFromRow);
}

export async function getPoisByRoute(routeId: string): Promise<Poi[]> {
  const { rows } = await pool().query<{
    id: string;
    region_slug: string;
    route_id: string;
    osm_id: string;
    lon: number;
    lat: number;
    kind: Poi["kind"];
    name: string | null;
  }>(
    `select id, region_slug, route_id, osm_id,
            st_x(geog::geometry) as lon, st_y(geog::geometry) as lat,
            kind, name
       from pois
      where route_id = $1`,
    [routeId]
  );
  return rows.map((r) => ({
    id: r.id,
    regionSlug: r.region_slug,
    routeId: r.route_id,
    osmId: r.osm_id,
    lat: Number(r.lat),
    lon: Number(r.lon),
    kind: r.kind,
    name: r.name,
  }));
}
