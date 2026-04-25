import { redirect } from "next/navigation";
import { listRegions } from "@/lib/db";
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

  // Lodging + routes are NOT fetched here. The client-side `useViewportData`
  // hook in ExplorerMap pulls them by bbox after the map mounts. At Marin
  // scale (890 routes) the difference is invisible; at CA scale (10K+) it's
  // the difference between a usable page and an OOM.
  return <Explorer region={region} regions={ready} />;
}
