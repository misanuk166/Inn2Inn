import { NextRequest, NextResponse } from "next/server";
import { searchLodging } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return NextResponse.json({ lodging: [] });
  }
  const limit = Math.min(50, Number(searchParams.get("limit") ?? "12") || 12);
  const lodging = await searchLodging(q, limit);
  return NextResponse.json({ lodging });
}
