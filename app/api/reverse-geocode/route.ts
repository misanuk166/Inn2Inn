// Lightweight Nominatim proxy used by the Planner's map-pick mode to label
// custom waypoints with a human-readable place name.

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const NOMINATIM = "https://nominatim.openstreetmap.org/reverse";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ error: "lat and lon required" }, { status: 400 });
  }
  const url = `${NOMINATIM}?format=jsonv2&lat=${lat}&lon=${lon}&zoom=14&addressdetails=0`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Inn2Inn/0.1 (planner reverse-geocode)" },
  });
  if (!res.ok) {
    return NextResponse.json({ label: `${lat.toFixed(4)}, ${lon.toFixed(4)}` });
  }
  const json = (await res.json()) as { display_name?: string; name?: string };
  const label = json.name || trimAddress(json.display_name) || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  return NextResponse.json({ label });
}

function trimAddress(s: string | undefined): string | undefined {
  if (!s) return undefined;
  // Display names are long ("Foo Trail, Mt Tam, Marin County, California, USA")
  // — keep the first two segments which are usually the most specific.
  return s.split(",").slice(0, 2).join(",").trim();
}
