import { NextRequest, NextResponse } from "next/server";
import { getLodgingByBbox, getLodgingByRegion } from "@/lib/db";
import type { Bbox } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const region = searchParams.get("region");
  const bboxParam = searchParams.get("bbox");

  if (region) {
    return NextResponse.json({ lodging: await getLodgingByRegion(region) });
  }
  if (bboxParam) {
    const bbox = parseBbox(bboxParam);
    if (!bbox) return NextResponse.json({ error: "invalid bbox" }, { status: 400 });
    return NextResponse.json({ lodging: await getLodgingByBbox(bbox) });
  }
  return NextResponse.json({ error: "region or bbox required" }, { status: 400 });
}

function parseBbox(s: string): Bbox | null {
  const parts = s.split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  return parts as Bbox;
}
