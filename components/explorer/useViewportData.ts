"use client";

import { useEffect, useRef } from "react";
import type { Map as MlMap } from "maplibre-gl";
import type { Bbox, Lodging, Route } from "@/lib/types";
import { useExplorer } from "./store";

// Pan/zoom debounce: short enough to feel responsive, long enough to skip
// intermediate frames during a flick.
const DEBOUNCE_MS = 250;

// LRU cap so a long browsing session doesn't grow memory unboundedly.
const CACHE_CAP = 64;

interface CachedView {
  lodging: Lodging[];
  routes: Route[];
}

/**
 * Hook the Explorer's data fetching to the map's viewport. On every settled
 * pan/zoom we ask `/api/lodging?bbox=` and `/api/routes?bbox=&zoom=` for the
 * data that's actually visible, with an LRU cache keyed by quantized bbox so
 * micro-pans don't refetch. The store's lodging/routes arrays then reflect
 * what's on screen, which is what the Sidebar's filter/list and the map's
 * sources both consume.
 *
 * Strategy:
 *   - First successful fetch fills the store from empty.
 *   - On every subsequent idle, replace.
 *   - In-flight requests are aborted when a newer one starts.
 *   - The currently-selected hotel is preserved even if it falls outside the
 *     fetched viewport (otherwise opening the right-hand HotelPanel — which
 *     shrinks the map and triggers a refetch — would nuke the selection).
 *     The selected hotel is held separately in the store as `selectedHotel`.
 */
export function useViewportData(map: MlMap | null, regionSlug: string): void {
  const setData = useExplorer((s) => s.setData);

  const cacheRef = useRef<Map<string, CachedView>>(new Map());
  const cacheKeysRef = useRef<string[]>([]); // FIFO order for LRU eviction

  useEffect(() => {
    if (!map) return;

    let aborter: AbortController | null = null;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    function recordCache(key: string, view: CachedView): void {
      cacheRef.current.set(key, view);
      cacheKeysRef.current.push(key);
      while (cacheKeysRef.current.length > CACHE_CAP) {
        const evict = cacheKeysRef.current.shift();
        if (evict) cacheRef.current.delete(evict);
      }
    }

    async function fetchForCurrentViewport() {
      if (!map) return;
      const b = map.getBounds();
      const bbox: Bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
      const z = Math.max(0, Math.min(20, Math.round(map.getZoom())));
      const key = `${regionSlug}:z${z}:${quantize(bbox)}`;

      const hit = cacheRef.current.get(key);
      if (hit) {
        setData(hit.lodging, hit.routes);
        return;
      }

      aborter?.abort();
      aborter = new AbortController();
      const signal = aborter.signal;

      try {
        const [lodgingRes, routesRes] = await Promise.all([
          fetch(`/api/lodging?bbox=${bbox.join(",")}`, { signal }),
          fetch(`/api/routes?bbox=${bbox.join(",")}&zoom=${z}`, { signal }),
        ]);
        if (cancelled || signal.aborted) return;
        const lodging: Lodging[] = (await lodgingRes.json()).lodging ?? [];
        const routes: Route[] = (await routesRes.json()).routes ?? [];
        recordCache(key, { lodging, routes });
        setData(lodging, routes);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        console.error("[useViewportData] fetch failed:", err);
      }
    }

    function onMoveEnd() {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(fetchForCurrentViewport, DEBOUNCE_MS);
    }

    // Wait for the map's first idle (after the initial fitBounds) before
    // fetching, so the bbox we read is the user's actual starting view.
    function onFirstIdle() {
      map?.off("idle", onFirstIdle);
      fetchForCurrentViewport();
    }
    map.on("idle", onFirstIdle);
    map.on("moveend", onMoveEnd);

    return () => {
      cancelled = true;
      aborter?.abort();
      if (debounce) clearTimeout(debounce);
      map.off("idle", onFirstIdle);
      map.off("moveend", onMoveEnd);
    };
  }, [map, regionSlug, setData]);
}

function quantize(bbox: Bbox): string {
  // 0.01° ≈ 1.1 km at CA latitudes. Pans within that bucket reuse the cache.
  const q = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
  return `${q(bbox[0])},${q(bbox[1])},${q(bbox[2])},${q(bbox[3])}`;
}
