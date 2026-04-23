import { NextRequest, NextResponse } from "next/server";
import { makeFootRouter } from "@/lib/routing";
import type { LngLat } from "@/lib/types";

export const dynamic = "force-dynamic";

interface Body {
  from: LngLat;
  to: LngLat;
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!isLngLat(body.from) || !isLngLat(body.to)) {
    return NextResponse.json({ error: "from and to must be [lon, lat] arrays" }, { status: 400 });
  }
  let result;
  try {
    result = await makeFootRouter().route(body.from, body.to);
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
  if (!result) {
    return NextResponse.json({ error: "no route found" }, { status: 404 });
  }
  return NextResponse.json({
    distanceMi: result.distanceMi,
    durationMin: result.durationMin,
    geometry: result.geometry,
  });
}

function isLngLat(v: unknown): v is LngLat {
  return Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === "number");
}
