"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, { Map as MlMap, StyleSpecification } from "maplibre-gl";
import type { Bbox } from "@/lib/types";
import { styleUrl, type MapStyleKind } from "./styles";
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

const DEFAULT_KIND: MapStyleKind = "topo";

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
      style: styleUrl(DEFAULT_KIND) as unknown as StyleSpecification | string,
      center: initialCenter,
      zoom: initialZoom,
      attributionControl: { compact: true },
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

  // Swap the underlying style sheet without unmounting the map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(styleUrl(styleKind) as unknown as StyleSpecification | string);
  }, [styleKind]);

  return (
    <div className={`relative h-full w-full ${className ?? ""}`}>
      <div ref={containerRef} className="absolute inset-0" />
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
