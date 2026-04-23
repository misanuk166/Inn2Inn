import { redirect } from "next/navigation";
import { listRegions, getLodgingByRegion, getRoutesByRegion } from "@/lib/db";
import { readyRegions } from "@/lib/regions";
import { serverSupabase } from "@/lib/supabase/server";
import { EmptyState } from "../explorer/EmptyState";
import { Planner } from "./Planner";
import type { Lodging, Route } from "@/lib/types";

export default async function PlannerPage() {
  const supabase = await serverSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in?next=/planner");

  const all = await listRegions();
  const ready = readyRegions(all);
  if (ready.length === 0) return <EmptyState />;

  // Catalog spans every ready region (a planner trip can be cross-region).
  const lodging: Lodging[] = [];
  const routes: Route[] = [];
  for (const r of ready) {
    lodging.push(...(await getLodgingByRegion(r.slug)));
    routes.push(...(await getRoutesByRegion(r.slug)));
  }

  return <Planner lodging={lodging} routes={routes} />;
}
