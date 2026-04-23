import { redirect } from "next/navigation";
import { getLodgingByRegion, getRoutesByRegion, listRegions } from "@/lib/db";
import { DEFAULT_REGION_SLUG, readyRegions } from "@/lib/regions";
import { Explorer } from "./Explorer";
import { EmptyState } from "./EmptyState";

interface SearchParams {
  region?: string;
}

export default async function ExplorerPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const all = await listRegions();
  const ready = readyRegions(all);

  if (ready.length === 0) {
    return <EmptyState />;
  }

  const requested = sp.region;
  const fallback = ready.find((r) => r.slug === DEFAULT_REGION_SLUG) ?? ready[0];
  const region = requested ? ready.find((r) => r.slug === requested) ?? null : fallback;

  if (!region) {
    redirect(`/explorer?region=${fallback.slug}`);
  }

  const [lodging, routes] = await Promise.all([
    getLodgingByRegion(region.slug),
    getRoutesByRegion(region.slug),
  ]);

  return <Explorer region={region} regions={ready} lodging={lodging} routes={routes} />;
}
