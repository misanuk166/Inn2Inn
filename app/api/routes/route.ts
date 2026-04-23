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
    return NextResponse.json({ routes: await getRoutesByBbox(bbox) });
  }
  return NextResponse.json({ error: "region, bbox, or hotelId required" }, { status: 400 });
}

function parseBbox(s: string): Bbox | null {
  const parts = s.split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  return parts as Bbox;
}
