import type { LineString, Point } from "geojson";

export type Bbox = [number, number, number, number]; // [west, south, east, north]

export type RegionStatus = "building" | "ready" | "disabled";

export interface Region {
  slug: string;
  name: string;
  bbox: Bbox;
  status: RegionStatus;
  routesCount: number;
}

export type LodgingType =
  | "hotel"
  | "guest_house"
  | "hostel"
  | "chalet"
  | "alpine_hut"
  | "motel"
  | "inn"
  | "cabin"
  | "lodge";

export interface Lodging {
  id: string;
  regionSlug: string;
  sourceId: string;
  name: string;
  type: LodgingType;
  lat: number;
  lon: number;
  city: string | null;
  state: string | null;
  address: string | null;
  elevationFt: number | null;
  priceRange: string | null;
  description: string | null;
  photoUrl: string | null;
  website: string | null;
}

export interface ScenicSubScores {
  naturalness: number; // 0..20
  elevation: number;   // 0..20
  water: number;       // 0..20
  surface: number;     // 0..20
  distance: number;    // 0..20
}

export type ScenicCategory =
  | "highly_scenic"
  | "scenic"
  | "moderately_scenic"
  | "urban_road";

export interface ElevationSample {
  distMi: number;
  elevFt: number;
}

export interface Route {
  id: string;
  regionSlug: string;
  aId: string;
  bId: string;
  distanceMi: number;
  durationMin: number;
  gainFt: number;
  lossFt: number;
  polyline: LineString;
  elevationProfile: ElevationSample[];
  scenicScore: number; // 0..100
  subScores: ScenicSubScores;
  category: ScenicCategory;
}

export type PoiKind = "restaurant" | "cafe" | "viewpoint" | "peak";

export interface Poi {
  id: string;
  regionSlug: string;
  routeId: string;
  osmId: string;
  lat: number;
  lon: number;
  kind: PoiKind;
  name: string | null;
}

export type LegEndpoint =
  | { kind: "hotel"; id: string }
  | { kind: "custom"; lat: number; lon: number; label: string };

export interface ItineraryLeg {
  from: LegEndpoint;
  to: { kind: "hotel"; id: string };
  routeId?: string;             // set when both endpoints are hotels with a precomputed route
  customGeometry?: LineString;  // set when on-demand routing was used
  distanceMi?: number;
  durationMin?: number;
  gainFt?: number;
  lossFt?: number;
}

export interface Itinerary {
  id: string;
  userId: string;
  name: string;
  legs: ItineraryLeg[];
  createdAt: string;
  updatedAt: string;
}

export const SCENIC_CATEGORY_LABEL: Record<ScenicCategory, string> = {
  highly_scenic: "Highly Scenic",
  scenic: "Scenic",
  moderately_scenic: "Moderately Scenic",
  urban_road: "Urban / Road",
};

export const SCENIC_CATEGORY_COLOR: Record<ScenicCategory, string> = {
  highly_scenic: "#1f7a3a",
  scenic: "#5fb863",
  moderately_scenic: "#d6a64a",
  urban_road: "#a55555",
};

// Type guards used by the Planner.
export function isHotelEndpoint(
  e: LegEndpoint
): e is Extract<LegEndpoint, { kind: "hotel" }> {
  return e.kind === "hotel";
}
export function isCustomEndpoint(
  e: LegEndpoint
): e is Extract<LegEndpoint, { kind: "custom" }> {
  return e.kind === "custom";
}

// Used by the routing client and pipeline to represent a coordinate pair.
export type LngLat = [number, number]; // [lon, lat]

export function pointToLngLat(p: Point): LngLat {
  return [p.coordinates[0], p.coordinates[1]];
}
