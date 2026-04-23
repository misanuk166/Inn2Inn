"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { Map as MlMap, MapMouseEvent } from "maplibre-gl";
import type { Route } from "@/lib/types";
import { SCENIC_CATEGORY_COLOR } from "@/lib/types";
import { Map as MapComponent, setOrUpdateGeoJsonSource } from "@/components/map/Map";
import { filterRoutes, useExplorer } from "./store";
import type { Bbox } from "@/lib/types";

const ROUTES_SRC = "explorer-routes";
const ROUTES_LAYER = "explorer-routes-layer";
const HOTELS_SRC = "explorer-hotels";
const HOTELS_LAYER = "explorer-hotels-layer";
const HOTELS_LABEL_LAYER = "explorer-hotels-label";

export function ExplorerMap({ initialBbox }: { initialBbox?: Bbox }) {
  const lodging = useExplorer((s) => s.lodging);
  const routes = useExplorer((s) => s.routes);
  const rating = useExplorer((s) => s.rating);
  const maxDistance = useExplorer((s) => s.maxDistance);
  const maxGain = useExplorer((s) => s.maxGain);
  const endpointHotelId = useExplorer((s) => s.endpointHotelId);
  const setSelectedHotel = useExplorer((s) => s.setSelectedHotel);

  const mapRef = useRef<MlMap | null>(null);
  const [styleReady, setStyleReady] = useState(0); // bumps on every style.load

  const filteredIds = useMemo(() => {
    const filtered = filterRoutes(routes, rating, maxDistance, maxGain, endpointHotelId);
    return new Set(filtered.map((r) => r.id));
  }, [routes, rating, maxDistance, maxGain, endpointHotelId]);

  // Mount-time setup: just keep the map instance and bump styleReady on every
  // style.load. We do NOT attach sources/layers here — that happens in the
  // data-driven effects below so we don't end up with empty layers when data
  // arrives after the map mounts.
  const handleReady = useCallback(
    (map: MlMap) => {
      mapRef.current = map;
      setStyleReady((n) => n + 1);

      // Click/hover behavior only needs to be registered once per layer, but
      // since layers get re-created on style swap, register after each ready.
      map.off("click", HOTELS_LAYER, onHotelClick);
      map.on("click", HOTELS_LAYER, onHotelClick);
      map.off("mouseenter", HOTELS_LAYER, onHotelEnter);
      map.on("mouseenter", HOTELS_LAYER, onHotelEnter);
      map.off("mouseleave", HOTELS_LAYER, onHotelLeave);
      map.on("mouseleave", HOTELS_LAYER, onHotelLeave);

      function onHotelClick(e: MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) {
        const id = (e.features?.[0]?.properties as { id?: string })?.id;
        if (id) setSelectedHotel(id);
      }
      function onHotelEnter() {
        map.getCanvas().style.cursor = "pointer";
      }
      function onHotelLeave() {
        map.getCanvas().style.cursor = "";
      }
    },
    [setSelectedHotel]
  );

  // Hotels: add or update the hotels source + layer whenever map is ready
  // AND lodging data is available.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;

    const fc: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: lodging.map((h) => ({
        type: "Feature",
        properties: { id: h.id, name: h.name },
        geometry: { type: "Point", coordinates: [h.lon, h.lat] },
      })),
    };
    setOrUpdateGeoJsonSource(map, HOTELS_SRC, fc);
    if (!map.getLayer(HOTELS_LAYER)) {
      map.addLayer({
        id: HOTELS_LAYER,
        type: "circle",
        source: HOTELS_SRC,
        paint: {
          "circle-radius": 6,
          "circle-color": "#0f172a",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });
    }
    if (!map.getLayer(HOTELS_LABEL_LAYER)) {
      map.addLayer({
        id: HOTELS_LABEL_LAYER,
        type: "symbol",
        source: HOTELS_SRC,
        layout: {
          "text-field": ["get", "name"],
          "text-size": 11,
          "text-offset": [0, 1.2],
          "text-anchor": "top",
          "text-allow-overlap": false,
        },
        paint: {
          "text-color": "#27272a",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.2,
        },
        minzoom: 11,
      });
    }
  }, [lodging, styleReady]);

  // Routes: same pattern — add or update whenever map ready + data available.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;

    const fc: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: routes.map((r) => routeToFeature(r, filteredIds.has(r.id))),
    };
    setOrUpdateGeoJsonSource(map, ROUTES_SRC, fc);
    if (!map.getLayer(ROUTES_LAYER)) {
      // Insert below the hotels layer so markers stay on top. If hotels layer
      // isn't there yet (unlikely given React effect ordering but safe), omit.
      const beforeId = map.getLayer(HOTELS_LAYER) ? HOTELS_LAYER : undefined;
      map.addLayer(
        {
          id: ROUTES_LAYER,
          type: "line",
          source: ROUTES_SRC,
          paint: {
            "line-color": ["get", "color"],
            "line-width": ["case", ["get", "matched"], 4, 2],
            "line-opacity": ["case", ["get", "matched"], 0.95, 0.25],
          },
          layout: { "line-cap": "round", "line-join": "round" },
        },
        beforeId
      );
    }
  }, [routes, filteredIds, styleReady]);

  return <MapComponent onReady={handleReady} initialBbox={initialBbox} />;
}

function routeToFeature(r: Route, matched = true): GeoJSON.Feature {
  return {
    type: "Feature",
    properties: {
      id: r.id,
      color: SCENIC_CATEGORY_COLOR[r.category],
      matched,
    },
    geometry: r.polyline,
  };
}
