import { NextRequest, NextResponse } from "next/server";
import { getRoutesByBbox, getRoutesByRegion, getRoutesForHotel } from "@/lib/db";
import type { Bbox } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const region = searchParams.get("region");
  const bboxParam = searchParams.get("bbox");
  const hotelId = searchParams.get("hotelId");
  const limit = Number(searchParams.get("limit") ?? "0") || undefined;

  if (hotelId) {
    return NextResponse.json({ routes: await getRoutesForHotel(hotelId, limit ?? 3) });
  }
  if (region) {
    return NextResponse.json({ routes: await getRoutesByRegion(region) });
  }
  if (bboxParam) {
    const bbox = parseBbox(bboxParam);
    if (!bbox) return NextResponse.json({ error: "invalid bbox" }, { status: 400 });
    const zoom = Number(searchParams.get("zoom") ?? "12");
    const cap = limit ?? limitForZoom(zoom);
    return NextResponse.json({ routes: await getRoutesByBbox(bbox, cap) });
  }
  return NextResponse.json({ error: "region, bbox, or hotelId required" }, { status: 400 });
}

function parseBbox(s: string): Bbox | null {
  const parts = s.split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  return parts as Bbox;
}

// Cap routes returned per request based on zoom — at low zooms, hundreds of
// overlapping polylines are unreadable anyway; at trail-detail zoom, allow
// the full network to render.
function limitForZoom(zoom: number): number {
  if (zoom < 8) return 200;
  if (zoom < 11) return 800;
  return 3000;
}
