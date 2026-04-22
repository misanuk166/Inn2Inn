// Region helpers shared by client and server. The authoritative list of
// regions and their statuses lives in the `regions` Postgres table; this file
// only provides static defaults and helpers that work without DB access
// (e.g. "where should the map first center if I know nothing yet?").

import type { Bbox, Region } from "./types";

export const DEFAULT_REGION_SLUG = "marin";

// Fallback bbox used before the region list loads. Marin County, CA.
export const DEFAULT_BBOX: Bbox = [-123.0, 37.8, -122.4, 38.4];

export function bboxCenter(bbox: Bbox): [number, number] {
  return [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
}

export function readyRegions(regions: Region[]): Region[] {
  return regions.filter((r) => r.status === "ready");
}

export function findRegion(regions: Region[], slug: string): Region | undefined {
  return regions.find((r) => r.slug === slug);
}
