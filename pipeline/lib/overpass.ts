// Thin wrapper around the Overpass API for OSM queries within a bbox.

import type { Bbox } from "../../lib/types";

const ENDPOINT = "https://overpass-api.de/api/interpreter";

export interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
  geometry?: Array<{ lat: number; lon: number }>;
}

export interface OverpassResponse {
  elements: OverpassElement[];
}

export async function overpass(query: string): Promise<OverpassResponse> {
  // Overpass rejects requests without a proper User-Agent (returns 429 / 406).
  // It also throttles aggressively — we retry once on 429/503.
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        "User-Agent": "Inn2Inn/0.1 (https://github.com/misanuk166/Inn2Inn; pipeline)",
      },
      body: "data=" + encodeURIComponent(query),
    });
    if (res.ok) return (await res.json()) as OverpassResponse;
    const txt = await res.text();
    if ((res.status === 429 || res.status === 503 || res.status === 504) && attempt < 2) {
      const wait = 5000 * (attempt + 1);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    throw new Error(`overpass ${res.status}: ${txt.slice(0, 200)}`);
  }
  throw new Error("overpass: unreachable");
}

export function bboxClause(bbox: Bbox): string {
  const [w, s, e, n] = bbox;
  return `(${s},${w},${n},${e})`;
}

// Lodging query: tourism=hotel|guest_house|hostel|chalet|alpine_hut|motel + tourism=apartment is excluded.
export function lodgingQuery(bbox: Bbox): string {
  const b = bboxClause(bbox);
  return `[out:json][timeout:60];
(
  node["tourism"~"^(hotel|guest_house|hostel|chalet|alpine_hut|motel)$"]${b};
  way["tourism"~"^(hotel|guest_house|hostel|chalet|alpine_hut|motel)$"]${b};
  node["tourism"="wilderness_hut"]${b};
);
out tags center;`;
}

// Major-road centerlines for the freeway-hotel filter. Scope is intentionally
// narrow (motorway, trunk) — "primary" would sweep up coastal highways like
// CA-1 at Muir Beach where curated inns sit right at the junction. Trail-only
// inns near Hwy 1 are exactly the point of the product.
export function majorRoadsQuery(bbox: Bbox): string {
  const b = bboxClause(bbox);
  return `[out:json][timeout:60];
way["highway"~"^(motorway|trunk)$"]${b};
out geom;`;
}

// POIs along a route: restaurants, cafes, viewpoints, peaks within a bbox
// (caller buffers the polyline and passes the buffer's bbox).
export function poiQuery(bbox: Bbox): string {
  const b = bboxClause(bbox);
  return `[out:json][timeout:60];
(
  node["amenity"~"^(restaurant|cafe)$"]${b};
  node["tourism"="viewpoint"]${b};
  node["natural"="peak"]${b};
);
out body;`;
}

// Bulk highway/landuse/water within bbox for scenic-scoring inputs.
export function featureQuery(bbox: Bbox): string {
  const b = bboxClause(bbox);
  return `[out:json][timeout:90];
(
  way["highway"]${b};
  way["landuse"~"^(forest|meadow|grass)$"]${b};
  way["natural"~"^(wood|water|coastline)$"]${b};
  way["leisure"~"^(park|nature_reserve)$"]${b};
  way["boundary"="protected_area"]${b};
);
out geom;`;
}
