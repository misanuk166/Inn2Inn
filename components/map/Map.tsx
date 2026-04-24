"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, { Map as MlMap } from "maplibre-gl";
import type { Bbox } from "@/lib/types";
import { styleFor, type MapStyleKind } from "./styles";
import { StyleSwitcher } from "./StyleSwitcher";

export interface MapProps {
  initialBbox?: Bbox;
  initialCenter?: [number, number];
  initialZoom?: number;
  showStyleSwitcher?: boolean;
  // Called once the map (and any subsequent style swap) finishes loading. Use
  // this to attach sources/layers — re-run on each style change so they survive
  // a full style swap.
  onReady?: (map: MlMap) => void;
  // Called once on initial mount with the live map instance (no style guarantee).
  onInit?: (map: MlMap) => void;
  className?: string;
}

const DEFAULT_KIND: MapStyleKind = "outdoor";

export function Map({
  initialBbox,
  initialCenter = [-122.7, 38.05],
  initialZoom = 9,
  showStyleSwitcher = true,
  onReady,
  onInit,
  className,
}: MapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [styleKind, setStyleKind] = useState<MapStyleKind>(DEFAULT_KIND);

  // Mount the map exactly once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleFor(DEFAULT_KIND),
      center: initialCenter,
      zoom: initialZoom,
      attributionControl: { compact: true },
      // Needed so screenshots (Playwright, html-to-canvas, user screenshot
      // extensions) capture what's on screen. Tiny perf cost; worth it.
      // Cast: the option is passed straight to the underlying WebGL context
      // in MapLibre, but isn't in the public MapOptions type until v6.
      ...({ preserveDrawingBuffer: true } as Record<string, unknown>),
    });
    mapRef.current = map;

    if (initialBbox) {
      map.fitBounds(
        [
          [initialBbox[0], initialBbox[1]],
          [initialBbox[2], initialBbox[3]],
        ],
        { padding: 40, animate: false }
      );
    }

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "imperial" }), "bottom-left");

    onInit?.(map);

    // Expose the map instance in dev for e2e tests and ad-hoc debugging.
    if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
      (window as unknown as { __inn2innMap?: MlMap }).__inn2innMap = map;
    }

    const handleStyleData = () => {
      onReady?.(map);
    };
    map.on("load", handleStyleData);
    map.on("style.load", handleStyleData);

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swap the style only when the user actually changes it. Skipping the
  // initial run is critical — firing setStyle() before the first style has
  // finished loading triggers "Style is not done loading.. Rebuilding from
  // scratch" and the map never surfaces tiles.
  const initialStyleKindRef = useRef(styleKind);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (styleKind === initialStyleKindRef.current) return;
    map.setStyle(styleFor(styleKind));
  }, [styleKind]);

  return (
    <div className={`absolute inset-0 ${className ?? ""}`}>
      {/* Inline style beats MapLibre's .maplibregl-map rule (which forces
          position: relative and would collapse the container to height 0). */}
      <div
        ref={containerRef}
        style={{ position: "absolute", inset: 0 }}
      />
      {showStyleSwitcher && (
        <div className="absolute top-2 left-2 z-10">
          <StyleSwitcher value={styleKind} onChange={setStyleKind} />
        </div>
      )}
    </div>
  );
}

// Imperative helpers used by callers attaching custom sources/layers.

export function setOrUpdateGeoJsonSource(
  map: MlMap,
  id: string,
  data: GeoJSON.FeatureCollection | GeoJSON.Feature
): void {
  const existing = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
  if (existing) {
    existing.setData(data);
  } else {
    map.addSource(id, { type: "geojson", data });
  }
}

export function fitToBbox(map: MlMap, bbox: Bbox, padding = 40): void {
  map.fitBounds(
    [
      [bbox[0], bbox[1]],
      [bbox[2], bbox[3]],
    ],
    { padding, animate: false }
  );
}
