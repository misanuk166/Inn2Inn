// Client for OSRM. Used by:
//   - the data pipeline to compute pre-computed routes between lodging pairs
//   - the Planner's /api/route-on-demand endpoint for custom-segment routing

import type { LineString } from "geojson";
import type { LngLat } from "./types";

export interface OsrmRouteResult {
  distanceMi: number;
  durationMin: number;
  geometry: LineString;
}

export interface OsrmClient {
  route(from: LngLat, to: LngLat): Promise<OsrmRouteResult | null>;
}

export function makeOsrmClient(baseUrl: string): OsrmClient {
  const base = baseUrl.replace(/\/+$/, "");
  return {
    async route(from, to) {
      const path = `${from[0]},${from[1]};${to[0]},${to[1]}`;
      const url = `${base}/route/v1/foot/${path}?overview=full&geometries=geojson`;
      const res = await fetch(url, { headers: { "User-Agent": "Inn2Inn/0.1" } });
      if (!res.ok) return null;
      const json = (await res.json()) as {
        code: string;
        routes: Array<{
          distance: number; // meters
          duration: number; // seconds
          geometry: LineString;
        }>;
      };
      if (json.code !== "Ok" || !json.routes.length) return null;
      const r = json.routes[0];
      return {
        distanceMi: r.distance / 1609.344,
        durationMin: r.duration / 60,
        geometry: r.geometry,
      };
    },
  };
}

export const DEFAULT_OSRM_URL =
  process.env.OSRM_URL ?? "https://router.project-osrm.org";
