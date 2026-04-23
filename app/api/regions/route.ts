import { NextResponse } from "next/server";
import { listRegions } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const regions = await listRegions();
  return NextResponse.json({ regions: regions.filter((r) => r.status === "ready") });
}
