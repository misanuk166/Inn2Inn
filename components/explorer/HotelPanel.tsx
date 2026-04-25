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
    fetch(`/api/routes?hotelId=${selectedId}&limit=5`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setTopRoutesFor({ id: selectedId, routes: d.routes ?? [] });
      })
      .catch(() => !cancelled && setTopRoutesFor({ id: selectedId, routes: [] }));
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  if (!hotel) return null;

  const topRoutes = topRoutesFor?.id === selectedId ? topRoutesFor.routes : null;
  const typeLabel = hotel.type.replace(/_/g, " ");

  function close() {
    setSelected(null);
    setEndpointHotel(null);
  }

  return (
    <aside className="flex h-full w-full max-w-md min-w-0 flex-col overflow-hidden border-l border-zinc-200 bg-white">
      {/* Header — photo or themed placeholder, with close button + name overlay */}
      <div className="relative shrink-0">
        <HotelPhoto hotel={hotel} />
        <button
          type="button"
          onClick={close}
          className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-zinc-700 shadow hover:bg-white"
          aria-label="Close"
        >
          ×
        </button>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent p-3 text-white">
          <h2 className="text-lg font-semibold leading-tight">{hotel.name}</h2>
          <p className="text-xs capitalize opacity-90">
            {typeLabel}
            {hotel.city ? ` · ${hotel.city}` : ""}
            {hotel.state ? `, ${hotel.state}` : ""}
          </p>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 text-sm">
        {(hotel.address || hotel.elevationFt !== null || hotel.priceRange) && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
            {hotel.address && (
              <>
                <dt className="text-zinc-500">Address</dt>
                <dd className="text-zinc-800">{hotel.address}</dd>
              </>
            )}
            {hotel.elevationFt !== null && (
              <>
                <dt className="text-zinc-500">Elevation</dt>
                <dd className="text-zinc-800">{hotel.elevationFt.toLocaleString()} ft</dd>
              </>
            )}
            {hotel.priceRange && (
              <>
                <dt className="text-zinc-500">Price</dt>
                <dd className="text-zinc-800">{hotel.priceRange}</dd>
              </>
            )}
          </dl>
        )}

        {hotel.description && (
          <p className="text-sm leading-relaxed text-zinc-700">{hotel.description}</p>
        )}

        <section>
          <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Top routes from this hotel
          </h3>
          {topRoutes === null ? (
            <p className="text-xs text-zinc-500">Loading…</p>
          ) : topRoutes.length === 0 ? (
            <p className="text-xs text-zinc-500">No routes from this hotel yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {topRoutes.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/routes/${r.id}`}
                    className="flex items-center justify-between gap-2 rounded-md border border-zinc-200 px-3 py-2 text-xs transition-colors hover:border-zinc-300 hover:bg-zinc-50"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: SCENIC_CATEGORY_COLOR[r.category] }}
                        aria-label={SCENIC_CATEGORY_LABEL[r.category]}
                      />
                      <span className="truncate text-zinc-800">
                        {r.distanceMi.toFixed(1)} mi · {r.gainFt.toLocaleString()} ft gain
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-zinc-900">
                      {r.scenicScore}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Footer — website CTA + planner link */}
      <div className="shrink-0 border-t border-zinc-100 bg-zinc-50 p-3">
        {hotel.website ? (
          <a
            href={hotel.website}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-1 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Visit hotel website
            <svg
              className="h-3 w-3 opacity-80"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden
            >
              <path d="M3 3h6v6M3 9l6-6" />
            </svg>
          </a>
        ) : (
          <p className="text-center text-xs text-zinc-500">No website on file</p>
        )}
      </div>
    </aside>
  );
}

function HotelPhoto({
  hotel,
}: {
  hotel: { name: string; type: string; photoUrl: string | null };
}) {
  if (hotel.photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={hotel.photoUrl}
        alt={hotel.name}
        className="h-44 w-full object-cover"
      />
    );
  }
  // Themed placeholder with the lodging type icon — gives the panel a strong
  // visual anchor even when no photo is on file.
  return (
    <div className="flex h-44 w-full items-center justify-center bg-gradient-to-br from-emerald-700 via-emerald-600 to-teal-700 text-white">
      <div className="flex flex-col items-center gap-2">
        <svg
          className="h-12 w-12 opacity-90"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden
        >
          <path d="M3 21V8l9-5 9 5v13" />
          <path d="M9 21V12h6v9" />
        </svg>
        <span className="text-[10px] uppercase tracking-widest opacity-80 capitalize">
          {hotel.type.replace(/_/g, " ")}
        </span>
      </div>
    </div>
  );
}
