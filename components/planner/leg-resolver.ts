// Resolves stats + geometry for a single planner leg, choosing between a
// precomputed route (fetched by pair from the DB) or an on-demand OSRM call.

import type { ItineraryLeg, Lodging, LngLat, Route } from "@/lib/types";
import { isHotelEndpoint } from "@/lib/types";

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
  hotelById: Record<string, Lodging>
): Promise<ResolvedLeg | null> {
  // Both endpoints are hotels — try the precomputed catalog first.
  if (isHotelEndpoint(leg.from) && isHotelEndpoint(leg.to) && leg.from.id && leg.to.id) {
    const r = await fetchPrecomputedRoute(leg.from.id, leg.to.id);
    if (r) {
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
  const from = endpointToLngLat(leg.from, hotelById);
  const to = endpointToLngLat(leg.to, hotelById);
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
    gainFt: 0,
    lossFt: 0,
    source: "on-demand",
  };
}

async function fetchPrecomputedRoute(aId: string, bId: string): Promise<Route | null> {
  try {
    const res = await fetch(`/api/routes/pair?a=${aId}&b=${bId}`);
    if (!res.ok) return null;
    const j = (await res.json()) as { route: Route | null };
    return j.route;
  } catch {
    return null;
  }
}

function endpointToLngLat(
  ep: ItineraryLeg["from"] | ItineraryLeg["to"],
  hotelById: Record<string, Lodging>
): LngLat | null {
  if (isHotelEndpoint(ep)) {
    const h = hotelById[ep.id];
    if (!h) return null;
    return [h.lon, h.lat];
  }
  return [ep.lon, ep.lat];
}

function reverseLine(line: GeoJSON.LineString): GeoJSON.LineString {
  return { type: "LineString", coordinates: line.coordinates.slice().reverse() };
}
