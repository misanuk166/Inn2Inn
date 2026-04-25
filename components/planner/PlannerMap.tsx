"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Map as MlMap } from "maplibre-gl";
import bbox from "@turf/bbox";
import { Map as MapComponent, fitToBbox, setOrUpdateGeoJsonSource } from "@/components/map/Map";
import { isCustomEndpoint, isHotelEndpoint } from "@/lib/types";
import { resolveLeg, type ResolvedLeg } from "./leg-resolver";
import { usePlanner } from "./store";

// Distinct color per leg (cycles for >10).
const LEG_COLORS = [
  "#059669", "#2563eb", "#dc2626", "#d97706", "#7c3aed",
  "#0891b2", "#be185d", "#65a30d", "#9333ea", "#ea580c",
];

export function PlannerMap() {
  const hotelById = usePlanner((s) => s.hotelById);
  const legs = usePlanner((s) => s.legs);
  const pickingLegIndex = usePlanner((s) => s.pickingLegIndex);
  const setLegFromCustom = usePlanner((s) => s.setLegFromCustom);
  const cancelPicking = usePlanner((s) => s.cancelPicking);

  const mapRef = useRef<MlMap | null>(null);
  const [resolved, setResolved] = useState<Array<ResolvedLeg | null>>([]);

  // Resolve every leg whenever the legs change.
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      legs.map((leg) =>
        (isHotelEndpoint(leg.to) && !leg.to.id) ||
        (isHotelEndpoint(leg.from) && !leg.from.id)
          ? Promise.resolve(null)
          : resolveLeg(leg, hotelById).catch(() => null)
      )
    ).then((results) => {
      if (!cancelled) {
        setResolved(results);
        // Mirror stats back into the planner store so the LegList shows them.
        const store = usePlanner.getState();
        const newLegs = legs.map((l, i) => {
          const r = results[i];
          if (!r) return l;
          return {
            ...l,
            routeId: r.routeId,
            customGeometry: r.source === "on-demand" ? r.geometry : undefined,
            distanceMi: r.distanceMi,
            durationMin: r.durationMin,
            gainFt: r.gainFt,
            lossFt: r.lossFt,
          };
        });
        // Avoid update loop: only set if anything changed.
        if (
          newLegs.some((l, i) => l.distanceMi !== legs[i].distanceMi || l.routeId !== legs[i].routeId)
        ) {
          store.loadItinerary(store.itineraryId, store.name, newLegs);
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [legs, hotelById]);

  const handleReady = useCallback(
    (map: MlMap) => {
      mapRef.current = map;

      // Click handler for map-pick mode.
      map.on("click", (e) => {
        const idx = usePlanner.getState().pickingLegIndex;
        if (idx === null) return;
        const { lng, lat } = e.lngLat;
        // Reverse-geocode for a label.
        fetch(`/api/reverse-geocode?lat=${lat}&lon=${lng}`)
          .then((r) => r.json())
          .then((d) => {
            setLegFromCustom(idx, lat, lng, d.label ?? `${lat.toFixed(4)}, ${lng.toFixed(4)}`);
            cancelPicking();
          })
          .catch(() => {
            setLegFromCustom(idx, lat, lng, `${lat.toFixed(4)}, ${lng.toFixed(4)}`);
            cancelPicking();
          });
      });
    },
    [setLegFromCustom, cancelPicking]
  );

  // Render leg lines + markers whenever resolved data changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const lineFeatures: GeoJSON.Feature[] = [];
    const markerFeatures: GeoJSON.Feature[] = [];

    legs.forEach((leg, i) => {
      const r = resolved[i];
      const color = LEG_COLORS[i % LEG_COLORS.length];
      if (r) {
        lineFeatures.push({
          type: "Feature",
          properties: { day: i + 1, color, dashed: r.source === "on-demand" },
          geometry: r.geometry,
        });
      }
      if (isCustomEndpoint(leg.from)) {
        markerFeatures.push({
          type: "Feature",
          properties: { day: i + 1, kind: "custom", color, label: leg.from.label },
          geometry: { type: "Point", coordinates: [leg.from.lon, leg.from.lat] },
        });
      }
    });

    // Hotel endpoints (deduped).
    const hotelIds = new globalThis.Set<string>();
    legs.forEach((leg) => {
      if (isHotelEndpoint(leg.from) && leg.from.id) hotelIds.add(leg.from.id);
      if (leg.to.id) hotelIds.add(leg.to.id);
    });
    for (const id of hotelIds) {
      const h = hotelById[id];
      if (!h) continue;
      markerFeatures.push({
        type: "Feature",
        properties: { kind: "hotel", color: "#0f172a", label: h.name },
        geometry: { type: "Point", coordinates: [h.lon, h.lat] },
      });
    }

    setOrUpdateGeoJsonSource(map, "legs", { type: "FeatureCollection", features: lineFeatures });
    setOrUpdateGeoJsonSource(map, "markers", {
      type: "FeatureCollection",
      features: markerFeatures,
    });

    if (!map.getLayer("legs-solid")) {
      map.addLayer({
        id: "legs-solid",
        type: "line",
        source: "legs",
        filter: ["!", ["get", "dashed"]],
        paint: { "line-color": ["get", "color"], "line-width": 4 },
        layout: { "line-cap": "round", "line-join": "round" },
      });
      map.addLayer({
        id: "legs-dashed",
        type: "line",
        source: "legs",
        filter: ["get", "dashed"],
        paint: {
          "line-color": ["get", "color"],
          "line-width": 4,
          "line-dasharray": [1.5, 1.5],
        },
        layout: { "line-cap": "round", "line-join": "round" },
      });
    }

    if (!map.getLayer("marker-circle")) {
      map.addLayer({
        id: "marker-circle",
        type: "circle",
        source: "markers",
        paint: {
          "circle-radius": 6,
          "circle-color": ["get", "color"],
          "circle-stroke-color": "#fff",
          "circle-stroke-width": 2,
        },
      });
      map.addLayer({
        id: "marker-label",
        type: "symbol",
        source: "markers",
        layout: {
          "text-field": ["get", "label"],
          "text-size": 11,
          "text-offset": [0, 1.3],
          "text-anchor": "top",
        },
        paint: {
          "text-color": "#18181b",
          "text-halo-color": "#fff",
          "text-halo-width": 1.2,
        },
      });
    }

    // Auto-fit.
    if (lineFeatures.length > 0) {
      try {
        const fc = { type: "FeatureCollection" as const, features: lineFeatures };
        const b = bbox(fc) as [number, number, number, number];
        fitToBbox(map, b, 60);
      } catch {
        /* no-op if bbox fails on a single point */
      }
    }
  }, [resolved, legs, hotelById]);

  // Picking-mode cursor.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = pickingLegIndex !== null ? "crosshair" : "";
  }, [pickingLegIndex]);

  return (
    <div className="relative h-full w-full">
      <MapComponent onReady={handleReady} />
      {pickingLegIndex !== null && (
        <div className="pointer-events-none absolute inset-x-0 top-3 z-20 mx-auto w-fit rounded-md bg-zinc-900/90 px-3 py-1.5 text-xs text-white shadow-lg">
          Click anywhere on the map to set the start of leg {pickingLegIndex + 1}.{" "}
          <button
            type="button"
            onClick={cancelPicking}
            className="pointer-events-auto ml-2 underline"
          >
            cancel
          </button>
        </div>
      )}
    </div>
  );
}

export function legColor(i: number): string {
  return LEG_COLORS[i % LEG_COLORS.length];
}
