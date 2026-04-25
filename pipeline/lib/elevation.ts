// Elevation lookup using the Open-Elevation public API.
// Batches up to 100 points per HTTP call and globally serializes — the
// public endpoint chokes on >2 concurrent requests across a session.
// Combined with a small backoff on 429/5xx, this is robust under the
// 20-way concurrent route resolution in 04-compute-routes.ts.

import pLimit from "p-limit";
import type { LngLat } from "../../lib/types";

const ENDPOINT = "https://api.open-elevation.com/api/v1/lookup";
const BATCH = 100;
// Open-Elevation serves from a small VPS; 1 in-flight request at a time is
// the only reliable setting. Routes still parallelize for the OSRM half.
const elevationLimit = pLimit(1);

export async function lookupElevations(points: LngLat[]): Promise<number[]> {
  const out: number[] = [];
  for (let i = 0; i < points.length; i += BATCH) {
    const batch = points.slice(i, i + BATCH);
    const body = JSON.stringify({
      locations: batch.map(([lon, lat]) => ({ latitude: lat, longitude: lon })),
    });
    const results = await elevationLimit(() => fetchBatch(body));
    for (const r of results) out.push(r);
    await sleep(200);
  }
  return out;
}

async function fetchBatch(body: string): Promise<number[]> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (res.ok) {
      const json = (await res.json()) as { results: Array<{ elevation: number }> };
      return json.results.map((r) => r.elevation);
    }
    if (res.status === 429 || res.status >= 500) {
      // Backoff 1s, 2s, 4s, 8s.
      await sleep(1000 * Math.pow(2, attempt));
      continue;
    }
    throw new Error(`open-elevation ${res.status} ${res.statusText}`);
  }
  throw new Error("open-elevation: exhausted retries on 429/5xx");
}

export async function lookupElevationFt(point: LngLat): Promise<number> {
  const [m] = await lookupElevations([point]);
  return Math.round(m * 3.28084);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
