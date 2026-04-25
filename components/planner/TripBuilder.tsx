"use client";

import { useState } from "react";
import { tripTotals, usePlanner } from "./store";
import { LegRow } from "./LegRow";
import { ItinerariesDrawer } from "./ItinerariesDrawer";

export function TripBuilder() {
  const legs = usePlanner((s) => s.legs);
  const name = usePlanner((s) => s.name);
  const setName = usePlanner((s) => s.setName);
  const addLeg = usePlanner((s) => s.addLeg);
  const itineraryId = usePlanner((s) => s.itineraryId);
  const newItinerary = usePlanner((s) => s.newItinerary);
  const loadItinerary = usePlanner((s) => s.loadItinerary);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "error">("idle");

  // "Saved" badge is derived from whether the current state matches what we
  // last successfully saved — no effect needed.
  const currentSnapshot = JSON.stringify({ name, legs });
  const isSaved = saveStatus !== "saving" && savedSnapshot === currentSnapshot;

  const totals = tripTotals(legs);

  async function save() {
    setSaveStatus("saving");
    const snapshot = currentSnapshot;
    const url = itineraryId ? `/api/itineraries/${itineraryId}` : "/api/itineraries";
    const method = itineraryId ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: snapshot,
    });
    if (!res.ok) {
      setSaveStatus("error");
      return;
    }
    const j = (await res.json()) as { id: string };
    if (!itineraryId) {
      loadItinerary(j.id, name, legs);
    }
    setSavedSnapshot(snapshot);
    setSaveStatus("idle");
  }

  return (
    <aside className="flex h-full w-full max-w-md flex-col border-r border-zinc-200 bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-zinc-200 p-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Trip name"
          className="min-w-0 flex-1 border-0 bg-transparent text-sm font-semibold text-zinc-900 focus:outline-none focus:ring-0"
        />
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="shrink-0 rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Saved
        </button>
        <button
          type="button"
          onClick={newItinerary}
          className="shrink-0 rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
        >
          New
        </button>
      </div>

      <div className="grid grid-cols-4 gap-2 border-b border-zinc-100 p-3 text-center">
        <Stat label="Days" value={totals.days.toString()} />
        <Stat label="Distance" value={`${totals.distanceMi.toFixed(1)} mi`} />
        <Stat label="Elev gain" value={`${totals.gainFt.toLocaleString()} ft`} />
        <Stat label="Time" value={formatDuration(totals.durationMin)} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {legs.length === 0 ? (
          <p className="px-1 py-6 text-center text-xs text-zinc-500">
            No legs yet. Click <strong>Add leg</strong> below to start planning.
          </p>
        ) : (
          <ul className="space-y-2">
            {legs.map((leg, i) => (
              <LegRow
                key={i}
                index={i}
                leg={leg}
                isFirst={i === 0}
                isLast={i === legs.length - 1}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-zinc-200 bg-white p-3">
        <button
          type="button"
          onClick={addLeg}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
        >
          + Add leg
        </button>
        <div className="flex items-center gap-2">
          {isSaved && itineraryId && <span className="text-xs text-emerald-600">Saved</span>}
          {saveStatus === "error" && <span className="text-xs text-red-600">Save failed</span>}
          <button
            type="button"
            onClick={save}
            disabled={legs.length === 0 || saveStatus === "saving" || isSaved}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {saveStatus === "saving" ? "Saving…" : itineraryId ? "Update" : "Save"}
          </button>
        </div>
      </div>

      {drawerOpen && <ItinerariesDrawer onClose={() => setDrawerOpen(false)} />}
    </aside>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="text-sm font-semibold text-zinc-900">{value}</div>
    </div>
  );
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes - h * 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
