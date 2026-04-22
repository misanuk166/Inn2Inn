// Elevation lookup using the Open-Elevation public API.
// Batches requests (up to 100 points per call) and is rate-limit aware.

import type { LngLat } from "../../lib/types";

const ENDPOINT = "https://api.open-elevation.com/api/v1/lookup";
const BATCH = 100;

export async function lookupElevations(points: LngLat[]): Promise<number[]> {
  const out: number[] = [];
  for (let i = 0; i < points.length; i += BATCH) {
    const batch = points.slice(i, i + BATCH);
    const body = JSON.stringify({
      locations: batch.map(([lon, lat]) => ({ latitude: lat, longitude: lon })),
    });
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (!res.ok) {
      throw new Error(`open-elevation ${res.status} ${res.statusText}`);
    }
    const json = (await res.json()) as {
      results: Array<{ elevation: number }>;
    };
    for (const r of json.results) out.push(r.elevation);
    // Polite delay between batches to avoid hammering the public API.
    await sleep(200);
  }
  return out;
}

export async function lookupElevationFt(point: LngLat): Promise<number> {
  const [m] = await lookupElevations([point]);
  return Math.round(m * 3.28084);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
