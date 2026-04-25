"use client";

import { useMemo } from "react";
import {
  RATING_LABELS,
  filterRoutes,
  useExplorer,
  type RatingFilter,
} from "./store";
import { RouteList } from "./RouteList";
import type { Region } from "@/lib/types";
import { RegionPicker } from "./RegionPicker";

const RATING_OPTIONS: RatingFilter[] = [
  "all",
  "highly_only",
  "scenic_and_above",
  "moderate_and_above",
  "urban_only",
];

export function Sidebar({
  regions,
  regionSlug,
  widthPx,
}: {
  regions: Region[];
  regionSlug: string;
  widthPx: number;
}) {
  const lodging = useExplorer((s) => s.lodging);
  const routes = useExplorer((s) => s.routes);
  const endpointHotelId = useExplorer((s) => s.endpointHotelId);
  const endpointDirection = useExplorer((s) => s.endpointDirection);
  const rating = useExplorer((s) => s.rating);
  const maxDistance = useExplorer((s) => s.maxDistance);
  const maxGain = useExplorer((s) => s.maxGain);

  const setEndpointHotel = useExplorer((s) => s.setEndpointHotel);
  const toggleDirection = useExplorer((s) => s.toggleDirection);
  const setRating = useExplorer((s) => s.setRating);
  const setMaxDistance = useExplorer((s) => s.setMaxDistance);
  const setMaxGain = useExplorer((s) => s.setMaxGain);

  const lodgingById = useMemo(() => new Map(lodging.map((l) => [l.id, l])), [lodging]);
  const filtered = useMemo(
    () => filterRoutes(routes, rating, maxDistance, maxGain, endpointHotelId),
    [routes, rating, maxDistance, maxGain, endpointHotelId]
  );
  const endpointHotel = endpointHotelId ? lodgingById.get(endpointHotelId) : null;

  return (
    <aside
      style={{ width: widthPx }}
      className="flex h-full min-w-0 shrink-0 flex-col overflow-hidden border-r border-zinc-200 bg-white"
    >
      <div className="flex min-w-0 flex-col gap-4 border-b border-zinc-200 p-4">
        <RegionPicker regions={regions} current={regionSlug} />

        {/* Endpoint hotel filter */}
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
            Hotel filter
          </label>
          <div className="flex min-w-0 gap-2">
            <select
              value={endpointHotelId ?? ""}
              onChange={(e) => setEndpointHotel(e.target.value || null)}
              className="min-w-0 flex-1 truncate rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
            >
              <option value="">Any hotel</option>
              {lodging
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
            </select>
            <button
              type="button"
              disabled={!endpointHotel}
              onClick={toggleDirection}
              className="shrink-0 whitespace-nowrap rounded-md border border-zinc-300 px-2 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
              title="Toggle whether this hotel is the departure or arrival point"
            >
              {endpointDirection === "depart" ? "Departing" : "Arriving"}
            </button>
          </div>
        </div>

        {/* Scenic rating */}
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
            Scenic rating
          </label>
          <select
            value={rating}
            onChange={(e) => setRating(e.target.value as RatingFilter)}
            className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
          >
            {RATING_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {RATING_LABELS[r]}
              </option>
            ))}
          </select>
        </div>

        {/* Distance slider */}
        <div>
          <div className="mb-1 flex items-baseline justify-between">
            <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
              Max distance
            </label>
            <span className="text-xs text-zinc-600">{maxDistance.toFixed(1)} mi</span>
          </div>
          <input
            type="range"
            min={1}
            max={15}
            step={0.5}
            value={maxDistance}
            onChange={(e) => setMaxDistance(Number(e.target.value))}
            className="w-full accent-emerald-600"
          />
        </div>

        {/* Gain slider */}
        <div>
          <div className="mb-1 flex items-baseline justify-between">
            <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
              Max elevation gain
            </label>
            <span className="text-xs text-zinc-600">{maxGain} ft</span>
          </div>
          <input
            type="range"
            min={0}
            max={5000}
            step={100}
            value={maxGain}
            onChange={(e) => setMaxGain(Number(e.target.value))}
            className="w-full accent-emerald-600"
          />
        </div>
      </div>

      <div className="flex items-center justify-between px-4 py-2 text-xs text-zinc-500">
        <span>
          {filtered.length} {filtered.length === 1 ? "route" : "routes"} of {routes.length}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <RouteList
          routes={filtered}
          lodgingById={lodgingById}
          endpointHotelId={endpointHotelId}
          direction={endpointDirection}
        />
      </div>
    </aside>
  );
}
