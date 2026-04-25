import { redirect } from "next/navigation";
import { listRegions } from "@/lib/db";
import { readyRegions } from "@/lib/regions";
import { serverSupabase } from "@/lib/supabase/server";
import { EmptyState } from "../explorer/EmptyState";
import { Planner } from "./Planner";

export default async function PlannerPage() {
  const supabase = await serverSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in?next=/planner");

  // Just verify there's at least one region with data; the Planner doesn't
  // preload any catalog. The hotel combobox in each leg fetches matches via
  // /api/lodging/search?q=, and saved itineraries lazily fetch their hotel
  // info via /api/lodging?ids=.
  const all = await listRegions();
  const ready = readyRegions(all);
  if (ready.length === 0) return <EmptyState />;

  return <Planner />;
}
