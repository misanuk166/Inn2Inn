// Step 2: build the region's lodging dataset.
//   1. Pull tourism=* nodes/ways from Overpass within the region bbox.
//   2. Merge with the YAML seed list (deduping by name + 50m proximity).
//   3. Drop entries within filterMajorRoadMeters of a major road.
//   4. Look up missing elevations via open-elevation.
//   5. Upsert into the lodging table.

import type { LodgingType, LngLat } from "../lib/types";
import { lookupElevations } from "./lib/elevation";
import { overpass, lodgingQuery, majorRoadsQuery } from "./lib/overpass";
import type { RegionConfig, SeedLodging } from "./lib/region";
import { pgPool } from "./lib/db";
import { log, progress } from "./lib/log";

interface Candidate {
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

const OSM_TYPE_MAP: Record<string, LodgingType> = {
  hotel: "hotel",
  guest_house: "guest_house",
  hostel: "hostel",
  chalet: "chalet",
  alpine_hut: "alpine_hut",
  motel: "motel",
  wilderness_hut: "alpine_hut",
};

export async function buildLodging(cfg: RegionConfig): Promise<void> {
  log("lodging", "fetching OSM tourism=* via Overpass...");
  const osm = await overpass(lodgingQuery(cfg.bbox));
  const osmCandidates: Candidate[] = osm.elements
    .map((el): Candidate | null => {
      const tags = el.tags ?? {};
      if (!tags.name) return null;
      const tourism = tags.tourism ?? "";
      const type = OSM_TYPE_MAP[tourism] ?? "hotel";
      const lat = el.lat ?? el.center?.lat;
      const lon = el.lon ?? el.center?.lon;
      if (lat === undefined || lon === undefined) return null;
      return {
        sourceId: `${el.type}/${el.id}`,
        name: tags.name,
        type,
        lat,
        lon,
        city: tags["addr:city"] ?? null,
        state: tags["addr:state"] ?? null,
        address: composeAddress(tags),
        elevationFt: null,
        priceRange: tags["price"] ?? null,
        description: tags["description"] ?? null,
        photoUrl: null,
        website: tags["website"] ?? tags["contact:website"] ?? null,
      };
    })
    .filter((c): c is Candidate => c !== null);
  log("lodging", `OSM returned ${osmCandidates.length} named lodgings`);

  const seedCandidates: Candidate[] = cfg.seedLodging.map((s) => seedToCandidate(s));
  log("lodging", `seed list adds ${seedCandidates.length} curated entries`);

  // Dedupe strategy:
  //   - If an OSM hit has the same normalized name as a seed entry, treat
  //     them as the same property. Trust OSM's coordinates (crowd-verified
  //     and updated as properties relocate), keep the seed's sourceId
  //     (stable across runs) and merge in the seed's curated metadata
  //     (description, website, priceRange, photoUrl) wherever OSM is empty.
  //   - If an OSM hit is within 100m of a seed entry, treat as the same
  //     property even if names differ (tagging variations).
  //   - Otherwise append as a new entry.
  const merged: Candidate[] = [...seedCandidates];
  let mergedCount = 0;
  for (const osmC of osmCandidates) {
    const match = merged.find((m) => {
      const mN = normalizeName(m.name);
      const oN = normalizeName(osmC.name);
      if (mN === oN) return true;

      const mWords = significantWords(m.name);
      const oWords = significantWords(osmC.name);

      // Substring: "Nick's Cove" ↔ "Nick's Cove Cottages".
      const contains =
        mN.length >= 8 && oN.length >= 8 && (mN.includes(oN) || oN.includes(mN));
      // Word-level Jaccard: catches "Cavallo Point Lodge" ↔ "Cavallo Point -
      // the Lodge at the Golden Gate" where the normalized strings don't
      // share a contiguous substring.
      const jaccard = jaccardSimilarity(mWords, oWords);
      const nameMatch = contains || jaccard >= 0.5;

      if (nameMatch) {
        // Hand-typed seed coords can be off by several km. 5km is generous
        // but still sanity-checks against wholly-different properties.
        return haversineMeters(m.lat, m.lon, osmC.lat, osmC.lon) < 5000;
      }
      // Proximity-only fallback for unrelated names at the same address.
      return haversineMeters(m.lat, m.lon, osmC.lat, osmC.lon) < 100;
    });
    if (match) {
      // Merge: OSM coords + seed's richer metadata wherever OSM is null/empty.
      match.lat = osmC.lat;
      match.lon = osmC.lon;
      match.type = match.type || osmC.type;
      match.city = match.city ?? osmC.city;
      match.state = match.state ?? osmC.state;
      match.address = match.address ?? osmC.address;
      match.website = match.website ?? osmC.website;
      match.description = match.description ?? osmC.description;
      match.priceRange = match.priceRange ?? osmC.priceRange;
      match.photoUrl = match.photoUrl ?? osmC.photoUrl;
      mergedCount++;
    } else {
      merged.push(osmC);
    }
  }
  log("lodging", `after dedupe: ${merged.length} (${mergedCount} OSM entries merged into seed)`);

  // Filter freeway hotels (OSM-sourced only — seed entries are hand-curated
  // and exempt, since coastal inns like Pelican Inn sit right at a Highway 1
  // junction that OSM tags as "primary").
  const seedIds = new Set(cfg.seedLodging.map((s) => s.id));
  log("lodging", "fetching major-road centerlines for filter...");
  const roads = await overpass(majorRoadsQuery(cfg.bbox));
  const roadSegments: Array<[LngLat, LngLat]> = [];
  for (const w of roads.elements) {
    if (!w.geometry) continue;
    for (let i = 1; i < w.geometry.length; i++) {
      const a = w.geometry[i - 1];
      const b = w.geometry[i];
      roadSegments.push([
        [a.lon, a.lat],
        [b.lon, b.lat],
      ]);
    }
  }
  const filtered = merged.filter((c) => {
    if (seedIds.has(c.sourceId)) return true;
    return minDistanceToSegments(c.lat, c.lon, roadSegments) >= cfg.filterMajorRoadMeters;
  });
  log(
    "lodging",
    `dropped ${merged.length - filtered.length} OSM entries within ${cfg.filterMajorRoadMeters}m of a major road (seed entries exempt)`
  );

  // Elevation lookup (only where missing).
  const needs = filtered.filter((c) => c.elevationFt === null);
  if (needs.length) {
    log("lodging", `looking up elevations for ${needs.length} properties...`);
    const elevations = await lookupElevations(needs.map((c) => [c.lon, c.lat] as LngLat));
    needs.forEach((c, i) => {
      c.elevationFt = Math.round(elevations[i] * 3.28084);
    });
  }

  // Upsert.
  const client = pgPool();
  for (let i = 0; i < filtered.length; i++) {
    const c = filtered[i];
    await client.query(
      `insert into lodging
         (region_slug, source_id, name, type, geog,
          city, state, address, elevation_ft, price_range, description, photo_url, website)
       values ($1, $2, $3, $4, st_setsrid(st_makepoint($5, $6), 4326)::geography,
               $7, $8, $9, $10, $11, $12, $13, $14)
       on conflict (region_slug, source_id) do update
         set name = excluded.name,
             type = excluded.type,
             geog = excluded.geog,
             city = excluded.city,
             state = excluded.state,
             address = excluded.address,
             elevation_ft = excluded.elevation_ft,
             price_range = excluded.price_range,
             description = excluded.description,
             photo_url = excluded.photo_url,
             website = excluded.website`,
      [
        cfg.slug,
        c.sourceId,
        c.name,
        c.type,
        c.lon,
        c.lat,
        c.city,
        c.state,
        c.address,
        c.elevationFt,
        c.priceRange,
        c.description,
        c.photoUrl,
        c.website,
      ]
    );
    if ((i + 1) % 10 === 0 || i === filtered.length - 1) {
      progress("lodging", i + 1, filtered.length, "upserted");
    }
  }

  // Drop lodging that wasn't in this run (region is the unit of truth).
  const sourceIds = filtered.map((c) => c.sourceId);
  await client.query(
    `delete from lodging where region_slug = $1 and source_id <> all($2::text[])`,
    [cfg.slug, sourceIds]
  );

  log("lodging", `done — ${filtered.length} properties in ${cfg.slug}`);
}

function seedToCandidate(s: SeedLodging): Candidate {
  return {
    sourceId: s.id,
    name: s.name,
    type: s.type,
    lat: s.lat,
    lon: s.lon,
    city: s.city ?? null,
    state: s.state ?? null,
    address: s.address ?? null,
    elevationFt: s.elevationFt ?? null,
    priceRange: s.priceRange ?? null,
    description: s.description ?? null,
    photoUrl: s.photoUrl ?? null,
    website: s.website ?? null,
  };
}

function composeAddress(tags: Record<string, string>): string | null {
  const parts = [
    tags["addr:housenumber"],
    tags["addr:street"],
    tags["addr:city"],
    tags["addr:state"],
    tags["addr:postcode"],
  ].filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

function normalizeName(n: string): string {
  return n.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

const STOPWORDS = new Set([
  "the", "a", "an", "of", "at", "on", "in", "to", "by", "and", "&",
  // Generic lodging nouns that would let "The Inn" match "The Inn of the
  // Golden Gate" spuriously.
  "inn", "hotel", "motel", "lodge", "hostel", "cottages", "cottage",
  "house", "suites", "cabins", "cabin", "resort", "retreat",
]);

function significantWords(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .split(/[^a-z0-9]+/g)
      .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const w of a) if (b.has(w)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const dφ = ((lat2 - lat1) * Math.PI) / 180;
  const dλ = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function minDistanceToSegments(
  lat: number,
  lon: number,
  segments: Array<[LngLat, LngLat]>
): number {
  let min = Infinity;
  for (const [a, b] of segments) {
    const d = pointToSegmentMeters(lat, lon, a[1], a[0], b[1], b[0]);
    if (d < min) min = d;
    if (min === 0) break;
  }
  return min;
}

function pointToSegmentMeters(
  pLat: number,
  pLon: number,
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number
): number {
  // Equirectangular projection; fine for short segments at non-polar latitudes.
  const R = 6371000;
  const cosLat = Math.cos((((pLat + aLat + bLat) / 3) * Math.PI) / 180);
  const px = (pLon * Math.PI) / 180 * R * cosLat;
  const py = (pLat * Math.PI) / 180 * R;
  const ax = (aLon * Math.PI) / 180 * R * cosLat;
  const ay = (aLat * Math.PI) / 180 * R;
  const bx = (bLon * Math.PI) / 180 * R * cosLat;
  const by = (bLat * Math.PI) / 180 * R;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}
