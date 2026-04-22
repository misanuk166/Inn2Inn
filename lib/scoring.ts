import type { LineString } from "geojson";
import type { ScenicCategory, ScenicSubScores } from "./types";

// Each sub-score is 0..20. The total scenic score is their sum (0..100).
// Category boundaries (per spec): >=72 highly, 52-71 scenic, 32-51 moderate, <32 urban.

export const SCENIC_THRESHOLDS = {
  HIGHLY: 72,
  SCENIC: 52,
  MODERATE: 32,
} as const;

export function categorize(score: number): ScenicCategory {
  if (score >= SCENIC_THRESHOLDS.HIGHLY) return "highly_scenic";
  if (score >= SCENIC_THRESHOLDS.SCENIC) return "scenic";
  if (score >= SCENIC_THRESHOLDS.MODERATE) return "moderately_scenic";
  return "urban_road";
}

export function totalScore(s: ScenicSubScores): number {
  return Math.round(
    clamp020(s.naturalness) +
      clamp020(s.elevation) +
      clamp020(s.water) +
      clamp020(s.surface) +
      clamp020(s.distance)
  );
}

function clamp020(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(20, n));
}

// ---------- sub-scores ----------

// Naturalness: fraction of polyline length within natural-area polygons,
// minus a penalty for major-road overlap. Inputs are pre-computed by the pipeline
// from PostGIS spatial joins against OSM landuse/highway tables.
export function scoreNaturalness({
  fractionInNatural,
  fractionOnMajorRoad,
}: {
  fractionInNatural: number; // 0..1
  fractionOnMajorRoad: number; // 0..1
}): number {
  const raw = 20 * fractionInNatural - 10 * fractionOnMajorRoad;
  return clamp020(raw);
}

// Elevation drama: log-scaled total ascent + descent.
// 0 ft → 0; 500 ft → ~10; 2000 ft → ~17; >=4000 ft → 20.
export function scoreElevation({
  gainFt,
  lossFt,
}: {
  gainFt: number;
  lossFt: number;
}): number {
  const total = Math.max(0, gainFt) + Math.max(0, lossFt);
  if (total <= 0) return 0;
  // log scaled: score = 20 * log(1 + total/100) / log(1 + 4000/100)
  const numerator = Math.log(1 + total / 100);
  const denominator = Math.log(1 + 4000 / 100);
  return clamp020(20 * (numerator / denominator));
}

// Water/coast proximity: fraction of polyline within 500 m of water/coastline.
export function scoreWater({
  fractionNearWater,
}: {
  fractionNearWater: number; // 0..1
}): number {
  return clamp020(20 * fractionNearWater);
}

// Trail surface: weighted average of OSM highway tag categories along the polyline.
// path/track/footway/bridleway → 1.0; service/residential → 0.5; primary/secondary/tertiary → 0.0
export function scoreSurface({
  fractionTrail,
  fractionMinor,
  fractionMajor,
}: {
  fractionTrail: number; // 0..1
  fractionMinor: number; // 0..1
  fractionMajor: number; // 0..1
}): number {
  const weighted =
    1.0 * fractionTrail + 0.5 * fractionMinor + 0.0 * fractionMajor;
  return clamp020(20 * weighted);
}

// Distance sweet spot: bell curve peaked at 6-8 mi, falling off below 2 and above 12.
// Uses a Gaussian centered at 7 mi with sigma=3.
export function scoreDistance({ distanceMi }: { distanceMi: number }): number {
  if (distanceMi <= 0) return 0;
  const center = 7;
  const sigma = 3;
  const z = (distanceMi - center) / sigma;
  const gauss = Math.exp(-0.5 * z * z); // 0..1
  return clamp020(20 * gauss);
}

// Helper: estimate total polyline length in miles for sub-score inputs that need it.
export function lineLengthMiles(line: LineString): number {
  let meters = 0;
  const c = line.coordinates;
  for (let i = 1; i < c.length; i++) {
    meters += haversine(c[i - 1][1], c[i - 1][0], c[i][1], c[i][0]);
  }
  return meters / 1609.344;
}

function haversine(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const dφ = ((lat2 - lat1) * Math.PI) / 180;
  const dλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
