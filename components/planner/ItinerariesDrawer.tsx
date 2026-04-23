"use client";

import { useEffect, useState } from "react";
import type { Itinerary } from "@/lib/types";
import { usePlanner } from "./store";

export function ItinerariesDrawer({ onClose }: { onClose: () => void }) {
  const loadItinerary = usePlanner((s) => s.loadItinerary);
  const [items, setItems] = useState<Itinerary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/itineraries")
      .then((r) => r.json())
      .then((d) => setItems(d.itineraries ?? []))
      .catch((e) => setError(String(e)));
  }, []);

  async function load(it: Itinerary) {
    loadItinerary(it.id, it.name, it.legs);
    onClose();
  }

  async function rename(it: Itinerary) {
    const newName = prompt("Rename itinerary:", it.name);
    if (!newName || newName === it.name) return;
    const res = await fetch(`/api/itineraries/${it.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName }),
    });
    if (res.ok) {
      setItems((cur) => cur?.map((x) => (x.id === it.id ? { ...x, name: newName } : x)) ?? null);
    }
  }

  async function remove(it: Itinerary) {
    if (!confirm(`Delete "${it.name}"?`)) return;
    const res = await fetch(`/api/itineraries/${it.id}`, { method: "DELETE" });
    if (res.ok) {
      setItems((cur) => cur?.filter((x) => x.id !== it.id) ?? null);
    }
  }

  return (
    <div className="fixed inset-0 z-30 bg-black/30" onClick={onClose}>
      <div
        className="absolute right-0 top-0 flex h-full w-80 flex-col border-l border-zinc-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-100 p-3">
          <h2 className="text-sm font-semibold text-zinc-900">Saved itineraries</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-100"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {error && <p className="p-2 text-xs text-red-600">{error}</p>}
          {items === null && <p className="p-2 text-xs text-zinc-500">Loading…</p>}
          {items?.length === 0 && (
            <p className="p-2 text-xs text-zinc-500">No saved itineraries yet.</p>
          )}
          <ul className="space-y-1">
            {items?.map((it) => (
              <li
                key={it.id}
                className="rounded-md border border-zinc-200 bg-white p-2 text-xs"
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="truncate font-medium text-zinc-900">{it.name}</span>
                  <span className="shrink-0 text-[10px] text-zinc-500">
                    {it.legs.length} {it.legs.length === 1 ? "leg" : "legs"}
                  </span>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => load(it)}
                    className="flex-1 rounded bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-emerald-700"
                  >
                    Load
                  </button>
                  <button
                    type="button"
                    onClick={() => rename(it)}
                    className="rounded border border-zinc-300 px-2 py-1 text-[11px] text-zinc-700 hover:bg-zinc-50"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(it)}
                    className="rounded border border-red-200 px-2 py-1 text-[11px] text-red-700 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
