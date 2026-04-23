"use client";

import { useState } from "react";
import Link from "next/link";
import type { Lodging, Poi, Route } from "@/lib/types";
import { SCENIC_CATEGORY_COLOR, SCENIC_CATEGORY_LABEL } from "@/lib/types";
import { ScenicBars } from "@/components/route-detail/ScenicBars";
import { ElevationProfile } from "@/components/route-detail/ElevationProfile";
import { RouteMap, poiLegendColor } from "@/components/route-detail/RouteMap";

export function RouteDetail({
  route,
  hotelA,
  hotelB,
  pois,
}: {
  route: Route;
  hotelA: Lodging;
  hotelB: Lodging;
  pois: Poi[];
}) {
  const [reversed, setReversed] = useState(false);
  const start = reversed ? hotelB : hotelA;
  const end = reversed ? hotelA : hotelB;
  const gain = reversed ? route.lossFt : route.gainFt;
  const loss = reversed ? route.gainFt : route.lossFt;

  const poiKinds = Array.from(new Set(pois.map((p) => p.kind))).sort();

  return (
    <div className="flex min-h-0 flex-1 flex-row">
      <div className="flex w-[440px] min-h-0 max-w-md flex-col overflow-y-auto border-r border-zinc-200 bg-white">
        <div className="border-b border-zinc-100 p-4">
          <Link href="/explorer" className="text-xs text-emerald-700 hover:underline">
            ← Back to Explorer
          </Link>
          <div className="mt-2 flex items-start justify-between gap-2">
            <h1 className="text-xl font-semibold leading-tight text-zinc-900">
              {start.name} → {end.name}
            </h1>
            <button
              type="button"
              onClick={() => setReversed((v) => !v)}
              className="shrink-0 rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
              title="Flip the direction of travel"
            >
              ⇄ Reverse
            </button>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
              style={{ backgroundColor: SCENIC_CATEGORY_COLOR[route.category] }}
            >
              {SCENIC_CATEGORY_LABEL[route.category]}
            </span>
            <span className="text-xs text-zinc-500">scenic score {route.scenicScore} / 100</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 border-b border-zinc-100 p-4">
          <Stat label="Distance" value={`${route.distanceMi.toFixed(1)} mi`} />
          <Stat label="Time" value={formatDuration(route.durationMin)} />
          <Stat label="Elevation gain" value={`${gain.toLocaleString()} ft`} />
          <Stat label="Elevation loss" value={`${loss.toLocaleString()} ft`} />
        </div>

        <div className="border-b border-zinc-100 p-4">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Scenic breakdown
          </h2>
          <ScenicBars subScores={route.subScores} />
        </div>

        <div className="border-b border-zinc-100 p-4">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Elevation profile
          </h2>
          <ElevationProfile profile={route.elevationProfile} reversed={reversed} />
        </div>

        <div className="grid grid-cols-2 gap-3 border-b border-zinc-100 p-4">
          <HotelCard hotel={start} role="Start" />
          <HotelCard hotel={end} role="End" />
        </div>

        <div className="p-4">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Along the way ({pois.length})
          </h2>
          {poiKinds.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2 text-[10px] text-zinc-600">
              {poiKinds.map((k) => (
                <span key={k} className="inline-flex items-center gap-1">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: poiLegendColor(k) }}
                  />
                  {k}
                </span>
              ))}
            </div>
          )}
          {pois.length === 0 ? (
            <p className="text-xs text-zinc-500">No POIs found within 200m of this route.</p>
          ) : (
            <ul className="space-y-1 text-xs text-zinc-700">
              {pois.slice(0, 30).map((p) => (
                <li key={p.id} className="flex items-center gap-2">
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: poiLegendColor(p.kind) }}
                  />
                  <span className="truncate">{p.name || `(unnamed ${p.kind})`}</span>
                </li>
              ))}
              {pois.length > 30 && (
                <li className="text-zinc-500">…and {pois.length - 30} more on the map</li>
              )}
            </ul>
          )}
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <RouteMap route={route} start={start} end={end} pois={pois} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="text-base font-semibold text-zinc-900">{value}</div>
    </div>
  );
}

function HotelCard({ hotel, role }: { hotel: Lodging; role: string }) {
  return (
    <div className="rounded-md border border-zinc-200 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">{role}</div>
      <div className="mt-0.5 text-sm font-semibold text-zinc-900">{hotel.name}</div>
      <div className="text-xs text-zinc-500">
        {hotel.city ?? ""}
        {hotel.elevationFt !== null ? ` · ${hotel.elevationFt.toLocaleString()} ft` : ""}
      </div>
    </div>
  );
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes - h * 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
