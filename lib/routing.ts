// Foot-routing client used by:
//   - the data pipeline to compute precomputed routes between lodging pairs
//   - the Planner's /api/route-on-demand endpoint for custom-segment routing
//
// Provider selection (in priority order):
//   1. OpenRouteService ("ors") — if ORS_API_KEY is set. Public free tier
//      supports the "foot-hiking" profile which follows trails, footways, and
//      paths — the correct profile for inn-to-inn hiking.
//   2. OSRM ("osrm") — if OSRM_URL points to a self-hosted instance with the
//      foot profile loaded. NOTE: the public demo at router.project-osrm.org
//      hosts the car profile only (per
//      https://github.com/Project-OSRM/osrm-backend#using-the-api-at-router-project-osrm-org)
//      even though it accepts /route/v1/foot/ URLs — it silently answers with
//      car. Using it for inn-to-inn would be wrong.

import type { LineString } from "geojson";
import type { LngLat } from "./types";

export interface OsrmRouteResult {
  distanceMi: number;
  durationMin: number;
  geometry: LineString;
}

export interface FootRouter {
  route(from: LngLat, to: LngLat): Promise<OsrmRouteResult | null>;
}

/** Returns the preferred router based on env vars. OSRM_URL wins when set
 * (user explicitly opted into self-hosted, which is fast + free at scale);
 * ORS is the fallback for environments where local/self-hosted isn't
 * reachable (e.g. Vercel runtime calling the on-demand routing endpoint). */
export function makeFootRouter(timeoutMs = 15_000): FootRouter {
  const osrm = process.env.OSRM_URL;
  if (osrm && !osrm.includes("project-osrm.org")) {
    return makeOsrmClient(osrm, timeoutMs);
  }
  const orsKey = process.env.ORS_API_KEY;
  if (orsKey) return makeOrsClient(orsKey, timeoutMs);
  throw new Error(
    "No foot-routing provider configured. Set OSRM_URL (self-hosted OSRM with " +
      "foot profile, recommended for bulk) or ORS_API_KEY (OpenRouteService " +
      "free tier, suitable for low-volume on-demand). router.project-osrm.org " +
      "is car-only and must not be used for inn-to-inn."
  );
}

export function makeOrsClient(apiKey: string, timeoutMs = 15_000): FootRouter {
  const url = "https://api.openrouteservice.org/v2/directions/foot-hiking/geojson";
  // ORS free tier: 40 requests/minute. Pace at 1 request every 1600ms to stay
  // safely under (37.5 req/min). Shared across all calls in this process.
  const MIN_INTERVAL_MS = 1600;
  let nextAvailable = 0;

  async function paced<T>(fn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const wait = Math.max(0, nextAvailable - now);
    nextAvailable = Math.max(now, nextAvailable) + MIN_INTERVAL_MS;
    if (wait) await new Promise((r) => setTimeout(r, wait));
    return fn();
  }

  async function requestOnce(from: LngLat, to: LngLat): Promise<Response | null> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      return await fetch(url, {
        method: "POST",
        headers: {
          Authorization: apiKey,
          "Content-Type": "application/json",
          Accept: "application/geo+json",
        },
        body: JSON.stringify({ coordinates: [from, to] }),
        signal: ctl.signal,
      });
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async route(from, to) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const res = await paced(() => requestOnce(from, to));
        if (!res) return null;
        if (res.status === 429 || res.status === 503) {
          // Rate-limited despite pacing (shared key, maybe). Back off.
          await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
          continue;
        }
        if (!res.ok) return null;
        const j = (await res.json()) as {
          features?: Array<{
            geometry: LineString;
            properties?: { summary?: { distance?: number; duration?: number } };
          }>;
        };
        const f = j.features?.[0];
        const summary = f?.properties?.summary;
        if (!f || !summary?.distance || !summary?.duration) return null;
        return {
          distanceMi: summary.distance / 1609.344,
          durationMin: summary.duration / 60,
          geometry: f.geometry,
        };
      }
      return null;
    },
  };
}

export function makeOsrmClient(baseUrl: string, timeoutMs = 10_000): FootRouter {
  const base = baseUrl.replace(/\/+$/, "");
  return {
    async route(from, to) {
      const path = `${from[0]},${from[1]};${to[0]},${to[1]}`;
      const url = `${base}/route/v1/foot/${path}?overview=full&geometries=geojson`;
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), timeoutMs);
      try {
        const res = await fetch(url, {
          headers: { "User-Agent": "Inn2Inn/0.1" },
          signal: ctl.signal,
        });
        if (!res.ok) return null;
        const json = (await res.json()) as {
          code: string;
          routes: Array<{ distance: number; duration: number; geometry: LineString }>;
        };
        if (json.code !== "Ok" || !json.routes.length) return null;
        const r = json.routes[0];
        return {
          distanceMi: r.distance / 1609.344,
          durationMin: r.duration / 60,
          geometry: r.geometry,
        };
      } catch {
        return null;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/** @deprecated retained for callers that still import `OsrmClient`. */
export type OsrmClient = FootRouter;

export const DEFAULT_OSRM_URL = process.env.OSRM_URL ?? "";
