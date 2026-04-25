import { NextRequest, NextResponse } from "next/server";
import { getRoutePair } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const a = searchParams.get("a");
  const b = searchParams.get("b");
  if (!a || !b) {
    return NextResponse.json(
      { error: "both a and b lodging ids required" },
      { status: 400 }
    );
  }
  const route = await getRoutePair(a, b);
  return NextResponse.json({ route });
}
