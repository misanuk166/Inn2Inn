// Resolves stats + geometry for a single planner leg, choosing between a
// precomputed route or an on-demand OSRM call.

import type { ItineraryLeg, Lodging, LngLat, Route } from "@/lib/types";
import { isHotelEndpoint } from "@/lib/types";
import { findPrecomputedRoute } from "./store";

export interface ResolvedLeg {
  geometry: GeoJSON.LineString;
  distanceMi: number;
  durationMin: number;
  gainFt: number;
  lossFt: number;
  source: "precomputed" | "on-demand";
  routeId?: string;
}

export async function resolveLeg(
  leg: ItineraryLeg,
  lodgingById: Map<string, Lodging>,
  precomputedRoutes: Route[]
): Promise<ResolvedLeg | null> {
  // Both endpoints are hotels with a precomputed route.
  if (isHotelEndpoint(leg.from) && isHotelEndpoint(leg.to)) {
    const r = findPrecomputedRoute(precomputedRoutes, leg.from.id, leg.to.id);
    if (r) {
      // If the stored route is in opposite direction, gain/loss are swapped.
      const reversed = r.aId === leg.to.id;
      return {
        geometry: reversed ? reverseLine(r.polyline) : r.polyline,
        distanceMi: r.distanceMi,
        durationMin: r.durationMin,
        gainFt: reversed ? r.lossFt : r.gainFt,
        lossFt: reversed ? r.gainFt : r.lossFt,
        source: "precomputed",
        routeId: r.id,
      };
    }
  }

  // Otherwise, fall back to on-demand OSRM.
  const from = endpointToLngLat(leg.from, lodgingById);
  const to = endpointToLngLat(leg.to, lodgingById);
  if (!from || !to) return null;

  const res = await fetch("/api/route-on-demand", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from, to }),
  });
  if (!res.ok) return null;
  const j = (await res.json()) as {
    distanceMi: number;
    durationMin: number;
    geometry: GeoJSON.LineString;
  };
  return {
    geometry: j.geometry,
    distanceMi: j.distanceMi,
    durationMin: j.durationMin,
    // OSRM doesn't return elevation; leave 0 for on-demand legs.
    gainFt: 0,
    lossFt: 0,
    source: "on-demand",
  };
}

function endpointToLngLat(
  ep: ItineraryLeg["from"] | ItineraryLeg["to"],
  lodgingById: Map<string, Lodging>
): LngLat | null {
  if (isHotelEndpoint(ep)) {
    const h = lodgingById.get(ep.id);
    if (!h) return null;
    return [h.lon, h.lat];
  }
  return [ep.lon, ep.lat];
}

function reverseLine(line: GeoJSON.LineString): GeoJSON.LineString {
  return { type: "LineString", coordinates: line.coordinates.slice().reverse() };
}
