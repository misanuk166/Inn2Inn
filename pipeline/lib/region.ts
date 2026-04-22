import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import YAML from "yaml";
import type { Bbox, LodgingType } from "../../lib/types";

export interface SeedLodging {
  id: string;
  name: string;
  type: LodgingType;
  lat: number;
  lon: number;
  city?: string;
  state?: string;
  address?: string;
  priceRange?: string;
  description?: string;
  website?: string;
  photoUrl?: string;
  elevationFt?: number;
}

export interface RegionConfig {
  slug: string;
  name: string;
  bbox: Bbox;
  osmExtractUrl: string;
  seedLodging: SeedLodging[];
  filterMajorRoadMeters: number;
  maxRouteMiles: number;
}

export async function loadRegionConfig(slug: string): Promise<RegionConfig> {
  const path = resolve(process.cwd(), "pipeline", "regions", `${slug}.yaml`);
  const text = await readFile(path, "utf8");
  const raw = YAML.parse(text) as Partial<RegionConfig>;
  if (!raw.slug || raw.slug !== slug) {
    throw new Error(`Region YAML slug "${raw.slug}" does not match arg "${slug}"`);
  }
  if (!raw.bbox || raw.bbox.length !== 4) {
    throw new Error(`Region "${slug}" has invalid bbox`);
  }
  return {
    slug: raw.slug,
    name: raw.name ?? raw.slug,
    bbox: raw.bbox as Bbox,
    osmExtractUrl: raw.osmExtractUrl ?? "",
    seedLodging: raw.seedLodging ?? [],
    filterMajorRoadMeters: raw.filterMajorRoadMeters ?? 200,
    maxRouteMiles: raw.maxRouteMiles ?? 10,
  };
}
