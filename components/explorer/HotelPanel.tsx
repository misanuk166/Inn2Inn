"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "@/lib/types";
import { SCENIC_CATEGORY_COLOR, SCENIC_CATEGORY_LABEL } from "@/lib/types";
import { useExplorer } from "./store";

export function HotelPanel() {
  const selectedId = useExplorer((s) => s.selectedHotelId);
  const setSelected = useExplorer((s) => s.setSelectedHotel);
  const setEndpointHotel = useExplorer((s) => s.setEndpointHotel);
  const lodging = useExplorer((s) => s.lodging);

  const hotel = lodging.find((l) => l.id === selectedId) ?? null;
  const [topRoutesFor, setTopRoutesFor] = useState<{ id: string; routes: Route[] } | null>(null);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    fetch(`/api/routes?hotelId=${selectedId}&limit=3`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setTopRoutesFor({ id: selectedId, routes: d.routes ?? [] });
      })
      .catch(() => !cancelled && setTopRoutesFor({ id: selectedId, routes: [] }));
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const topRoutes = topRoutesFor?.id === selectedId ? topRoutesFor.routes : null;

  if (!hotel) return null;

  return (
    <div className="absolute right-4 top-4 z-20 w-80 rounded-lg border border-zinc-200 bg-white shadow-lg">
      <div className="flex items-start justify-between gap-2 border-b border-zinc-100 p-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-zinc-900">{hotel.name}</h3>
          <p className="truncate text-xs text-zinc-500 capitalize">
            {hotel.type.replace(/_/g, " ")}
            {hotel.city ? ` · ${hotel.city}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSelected(null)}
          className="rounded p-1 text-zinc-500 hover:bg-zinc-100"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      {hotel.photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={hotel.photoUrl}
          alt={hotel.name}
          className="h-32 w-full object-cover"
        />
      )}

      <div className="space-y-2 p-3 text-xs">
        {hotel.address && <p className="text-zinc-700">{hotel.address}</p>}
        <p className="text-zinc-600">
          {hotel.elevationFt !== null && (
            <>
              Elevation {hotel.elevationFt.toLocaleString()} ft
              {hotel.priceRange ? ` · ${hotel.priceRange}` : ""}
            </>
          )}
        </p>
        {hotel.description && <p className="text-zinc-700">{hotel.description}</p>}
      </div>

      <div className="border-t border-zinc-100 p-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          Top routes from this hotel
        </p>
        {topRoutes === null ? (
          <p className="text-xs text-zinc-500">Loading…</p>
        ) : topRoutes.length === 0 ? (
          <p className="text-xs text-zinc-500">No routes from this hotel yet.</p>
        ) : (
          <ul className="space-y-1">
            {topRoutes.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/routes/${r.id}`}
                  className="flex items-center justify-between gap-2 rounded px-1 py-0.5 hover:bg-zinc-50"
                >
                  <span className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: SCENIC_CATEGORY_COLOR[r.category] }}
                      aria-label={SCENIC_CATEGORY_LABEL[r.category]}
                    />
                    <span className="text-xs text-zinc-700">
                      {r.distanceMi.toFixed(1)} mi · {r.gainFt.toLocaleString()} ft
                    </span>
                  </span>
                  <span className="text-xs font-semibold tabular-nums text-zinc-900">
                    {r.scenicScore}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex gap-2 border-t border-zinc-100 p-3">
        <button
          type="button"
          onClick={() => {
            setEndpointHotel(hotel.id);
            setSelected(null);
          }}
          className="flex-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
        >
          Pin as endpoint
        </button>
        {hotel.website && (
          <a
            href={hotel.website}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 rounded-md border border-zinc-300 px-3 py-1.5 text-center text-xs font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Website
          </a>
        )}
      </div>
    </div>
  );
}
