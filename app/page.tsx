import Link from "next/link";
import { listRegions } from "@/lib/db";
import { readyRegions } from "@/lib/regions";
import { RegionGrid } from "@/components/landing/RegionGrid";

export const dynamic = "force-dynamic";

export default async function Home() {
  const all = await listRegions();
  const ready = readyRegions(all);
  const totalRoutes = ready.reduce((s, r) => s + r.routesCount, 0);

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <section className="mx-auto w-full max-w-5xl px-4 py-12 sm:py-16">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
          Hike between inns in California.
        </h1>
        <p className="mt-3 max-w-2xl text-base text-zinc-600 sm:text-lg">
          Discover lodging properties that are walkable between each other on
          actual trails — not roads. Plan a multi-day trip across {ready.length}{" "}
          {ready.length === 1 ? "region" : "regions"} and{" "}
          {totalRoutes.toLocaleString()} pre-computed foot routes scored for
          scenic quality.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={`/explorer${ready[0] ? `?region=${ready[0].slug}` : ""}`}
            className="inline-flex items-center justify-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Explore the map
          </Link>
          <Link
            href="/planner"
            className="inline-flex items-center justify-center rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Build a trip
          </Link>
        </div>
      </section>

      <section className="mx-auto w-full max-w-5xl flex-1 px-4 pb-12 sm:pb-20">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Regions
        </h2>
        {ready.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-6 text-sm text-zinc-600">
            No regions loaded yet. Run{" "}
            <code className="rounded bg-zinc-200 px-1 py-0.5 text-xs">
              npm run pipeline -- --region=&lt;slug&gt;
            </code>{" "}
            to populate one.
          </p>
        ) : (
          <RegionGrid regions={ready} />
        )}
      </section>
    </div>
  );
}
