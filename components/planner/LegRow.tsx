"use client";

import type { ItineraryLeg, Lodging } from "@/lib/types";
import { isCustomEndpoint, isHotelEndpoint } from "@/lib/types";
import { usePlanner } from "./store";
import { legColor } from "./PlannerMap";

export function LegRow({
  index,
  leg,
  lodging,
  isFirst,
  isLast,
}: {
  index: number;
  leg: ItineraryLeg;
  lodging: Lodging[];
  isFirst: boolean;
  isLast: boolean;
}) {
  const setLegToHotel = usePlanner((s) => s.setLegToHotel);
  const setLegFromHotel = usePlanner((s) => s.setLegFromHotel);
  const removeLeg = usePlanner((s) => s.removeLeg);
  const moveLeg = usePlanner((s) => s.moveLeg);
  const beginPicking = usePlanner((s) => s.beginPicking);
  const pickingLegIndex = usePlanner((s) => s.pickingLegIndex);

  const fromLocked = !isFirst && isHotelEndpoint(leg.from);
  const fromLabel = isCustomEndpoint(leg.from)
    ? leg.from.label
    : lodging.find((l) => l.id === (leg.from as { id: string }).id)?.name ?? "(unset)";

  return (
    <li className="rounded-md border border-zinc-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
            style={{ backgroundColor: legColor(index) }}
          >
            {index + 1}
          </span>
          <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Day {index + 1}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={isFirst}
            onClick={() => moveLeg(index, index - 1)}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30"
            aria-label="Move up"
          >
            ↑
          </button>
          <button
            type="button"
            disabled={isLast}
            onClick={() => moveLeg(index, index + 1)}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30"
            aria-label="Move down"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={() => removeLeg(index)}
            className="rounded p-1 text-red-500 hover:bg-red-50"
            aria-label="Delete leg"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
            Start
          </label>
          {fromLocked ? (
            <div className="flex items-center justify-between rounded-md bg-zinc-50 px-2 py-1.5 text-xs text-zinc-700">
              <span>{fromLabel}</span>
              <span className="text-[10px] uppercase tracking-wide text-zinc-400">
                from prev day
              </span>
            </div>
          ) : (
            <div className="flex gap-2">
              <select
                value={isHotelEndpoint(leg.from) ? leg.from.id : ""}
                onChange={(e) => setLegFromHotel(index, e.target.value || null)}
                className="flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs"
              >
                <option value="">{isCustomEndpoint(leg.from) ? leg.from.label : "(select hotel)"}</option>
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
                onClick={() => beginPicking(index)}
                className={
                  "rounded-md border border-zinc-300 px-2 py-1.5 text-xs font-medium hover:bg-zinc-50 " +
                  (pickingLegIndex === index ? "bg-emerald-50 text-emerald-700" : "text-zinc-700")
                }
                title="Click on the map to pick a custom start point"
              >
                Pick on map
              </button>
            </div>
          )}
        </div>

        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
            End (must be a hotel)
          </label>
          <select
            value={leg.to.id}
            onChange={(e) => setLegToHotel(index, e.target.value)}
            className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs"
          >
            <option value="">(select hotel)</option>
            {lodging
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
          </select>
        </div>
      </div>

      {leg.distanceMi !== undefined && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-zinc-600">
          <span>{leg.distanceMi.toFixed(1)} mi</span>
          {leg.gainFt !== undefined && leg.gainFt > 0 && (
            <span>{leg.gainFt.toLocaleString()} ft gain</span>
          )}
          {leg.durationMin !== undefined && (
            <span>{formatDuration(leg.durationMin)}</span>
          )}
          {!leg.routeId && (
            <span className="rounded-sm bg-amber-100 px-1 text-[10px] text-amber-800">
              custom segment
            </span>
          )}
        </div>
      )}
    </li>
  );
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes - h * 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
