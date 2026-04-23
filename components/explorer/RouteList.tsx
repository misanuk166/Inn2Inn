"use client";

import Link from "next/link";
import type { Lodging, Route } from "@/lib/types";
import { SCENIC_CATEGORY_LABEL, SCENIC_CATEGORY_COLOR } from "@/lib/types";
import { routeEndpoints } from "./route-name";

export function RouteList({
  routes,
  lodgingById,
  endpointHotelId,
  direction,
}: {
  routes: Route[];
  lodgingById: Map<string, Lodging>;
  endpointHotelId: string | null;
  direction: "depart" | "arrive";
}) {
  if (routes.length === 0) {
    return (
      <p className="px-4 py-6 text-sm text-zinc-500">
        No routes match the current filters.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-zinc-100">
      {routes.map((r) => {
        const ep = routeEndpoints(r, lodgingById, endpointHotelId, direction);
        return (
          <li key={r.id}>
            <Link
              href={`/routes/${r.id}`}
              className="block px-4 py-3 transition-colors hover:bg-zinc-50"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-medium text-zinc-900">
                  {ep.fromName} → {ep.toName}
                </span>
                <span className="shrink-0 text-xs font-semibold tabular-nums text-zinc-700">
                  {r.scenicScore}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
                <RatingBadge category={r.category} />
                <span>{r.distanceMi.toFixed(1)} mi</span>
                <span>·</span>
                <span>{r.gainFt.toLocaleString()} ft gain</span>
                <span>·</span>
                <span>{formatDuration(r.durationMin)}</span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function RatingBadge({ category }: { category: Route["category"] }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
      style={{ backgroundColor: SCENIC_CATEGORY_COLOR[category] }}
    >
      {SCENIC_CATEGORY_LABEL[category]}
    </span>
  );
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes - h * 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
