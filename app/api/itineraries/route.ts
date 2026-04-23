import { NextRequest, NextResponse } from "next/server";
import { serverSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await serverSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("itineraries")
    .select("id, user_id, name, legs, created_at, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    itineraries:
      data?.map((r) => ({
        id: r.id,
        userId: r.user_id,
        name: r.name,
        legs: r.legs,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })) ?? [],
  });
}

export async function POST(req: NextRequest) {
  const supabase = await serverSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as { name?: string; legs?: unknown[] };
  if (!body.name || !Array.isArray(body.legs)) {
    return NextResponse.json({ error: "name and legs required" }, { status: 400 });
  }
  const { data, error } = await supabase
    .from("itineraries")
    .insert({ user_id: user.id, name: body.name, legs: body.legs })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}
