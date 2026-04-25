"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { Map as MlMap, MapMouseEvent } from "maplibre-gl";
import { useRouter } from "next/navigation";
import type { Route } from "@/lib/types";
import { SCENIC_CATEGORY_COLOR, SCENIC_CATEGORY_LABEL } from "@/lib/types";
import { Map as MapComponent, setOrUpdateGeoJsonSource } from "@/components/map/Map";
import { filterRoutes, useExplorer } from "./store";
import type { Bbox } from "@/lib/types";

const ROUTES_SRC = "explorer-routes";
const ROUTES_LAYER = "explorer-routes-layer";
const ROUTES_HIT_LAYER = "explorer-routes-hit"; // wide invisible click target
const HOTELS_SRC = "explorer-hotels";
const HOTELS_LAYER = "explorer-hotels-layer";
const HOTELS_LABEL_LAYER = "explorer-hotels-label";

export function ExplorerMap({ initialBbox }: { initialBbox?: Bbox }) {
  const router = useRouter();
  const lodging = useExplorer((s) => s.lodging);
  const routes = useExplorer((s) => s.routes);
  const rating = useExplorer((s) => s.rating);
  const maxDistance = useExplorer((s) => s.maxDistance);
  const maxGain = useExplorer((s) => s.maxGain);
  const endpointHotelId = useExplorer((s) => s.endpointHotelId);
  const setSelectedHotel = useExplorer((s) => s.setSelectedHotel);
  const setEndpointHotel = useExplorer((s) => s.setEndpointHotel);

  const mapRef = useRef<MlMap | null>(null);
  const [styleReady, setStyleReady] = useState(0);

  const filteredIds = useMemo(() => {
    const filtered = filterRoutes(routes, rating, maxDistance, maxGain, endpointHotelId);
    return new Set(filtered.map((r) => r.id));
  }, [routes, rating, maxDistance, maxGain, endpointHotelId]);

  // Lookup tables for hover popups — without these we'd have to round-trip
  // an API call on every hover.
  const lodgingById = useMemo(() => new Map(lodging.map((l) => [l.id, l])), [lodging]);
  const routesById = useMemo(() => new Map(routes.map((r) => [r.id, r])), [routes]);

  // Refs so the imperative mouse handlers always see the latest data
  // without re-binding on every render.
  const lodgingByIdRef = useRef(lodgingById);
  const routesByIdRef = useRef(routesById);
  useEffect(() => {
    lodgingByIdRef.current = lodgingById;
    routesByIdRef.current = routesById;
  }, [lodgingById, routesById]);

  const handleReady = useCallback(
    (map: MlMap) => {
      mapRef.current = map;
      setStyleReady((n) => n + 1);

      const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 8,
        className: "explorer-route-popup",
      });

      // Hotels.
      map.off("click", HOTELS_LAYER, onHotelClick);
      map.on("click", HOTELS_LAYER, onHotelClick);
      map.off("mouseenter", HOTELS_LAYER, onHotelEnter);
      map.on("mouseenter", HOTELS_LAYER, onHotelEnter);
      map.off("mouseleave", HOTELS_LAYER, onHotelLeave);
      map.on("mouseleave", HOTELS_LAYER, onHotelLeave);

      // Routes — wide hit layer so the user doesn't have to thread a 4px line.
      map.off("click", ROUTES_HIT_LAYER, onRouteClick);
      map.on("click", ROUTES_HIT_LAYER, onRouteClick);
      map.off("mousemove", ROUTES_HIT_LAYER, onRouteMove);
      map.on("mousemove", ROUTES_HIT_LAYER, onRouteMove);
      map.off("mouseleave", ROUTES_HIT_LAYER, onRouteLeave);
      map.on("mouseleave", ROUTES_HIT_LAYER, onRouteLeave);

      // Background click clears selection.
      map.off("click", onMapClick);
      map.on("click", onMapClick);

      function onHotelClick(e: MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) {
        const id = (e.features?.[0]?.properties as { id?: string })?.id;
        if (!id) return;
        setSelectedHotel(id);
        setEndpointHotel(id);
      }
      function onMapClick(e: MapMouseEvent) {
        // Layer-specific handlers fire first; if a marker or route was hit,
        // skip the background-clear behavior.
        const hits = map.queryRenderedFeatures(e.point, {
          layers: [HOTELS_LAYER, ROUTES_HIT_LAYER],
        });
        if (hits.length > 0) return;
        setSelectedHotel(null);
        setEndpointHotel(null);
      }
      function onHotelEnter() {
        map.getCanvas().style.cursor = "pointer";
      }
      function onHotelLeave() {
        map.getCanvas().style.cursor = "";
      }

      function onRouteClick(e: MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) {
        const id = (e.features?.[0]?.properties as { id?: string })?.id;
        if (!id) return;
        // Don't navigate if the click also hit a hotel marker (hotel takes
        // priority — its handler ran first).
        const hotelHit = map.queryRenderedFeatures(e.point, { layers: [HOTELS_LAYER] });
        if (hotelHit.length > 0) return;
        router.push(`/routes/${id}`);
      }
      function onRouteMove(e: MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) {
        const f = e.features?.[0];
        if (!f) return;
        const id = (f.properties as { id?: string })?.id;
        if (!id) return;
        const route = routesByIdRef.current.get(id);
        if (!route) return;
        const a = lodgingByIdRef.current.get(route.aId)?.name ?? "?";
        const b = lodgingByIdRef.current.get(route.bId)?.name ?? "?";
        const color = SCENIC_CATEGORY_COLOR[route.category];
        const cat = SCENIC_CATEGORY_LABEL[route.category];
        map.getCanvas().style.cursor = "pointer";
        popup
          .setLngLat(e.lngLat)
          .setHTML(
            `<div style="font-family:system-ui,sans-serif;font-size:12px;line-height:1.35;min-width:180px">
               <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
                 <strong style="font-size:13px;color:#18181b">${escapeHtml(a)} → ${escapeHtml(b)}</strong>
                 <span style="font-weight:700;font-variant-numeric:tabular-nums;color:#18181b">${route.scenicScore}</span>
               </div>
               <div style="display:flex;align-items:center;gap:6px;margin-top:4px">
                 <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color}"></span>
                 <span style="color:#52525b;font-size:11px">${cat}</span>
                 <span style="color:#a1a1aa">·</span>
                 <span style="color:#52525b;font-size:11px">${route.distanceMi.toFixed(1)} mi · ${route.gainFt.toLocaleString()} ft gain</span>
               </div>
               <div style="margin-top:6px;font-size:10px;color:#71717a">click for details</div>
             </div>`
          )
          .addTo(map);
      }
      function onRouteLeave() {
        map.getCanvas().style.cursor = "";
        popup.remove();
      }
    },
    [setSelectedHotel, setEndpointHotel, router]
  );

  // Hotels source/layer.
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

  // Routes source + visible layer + wide hit layer.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;

    const fc: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: routes.map((r) => routeToFeature(r, filteredIds.has(r.id))),
    };
    setOrUpdateGeoJsonSource(map, ROUTES_SRC, fc);
    if (!map.getLayer(ROUTES_LAYER)) {
      const beforeId = map.getLayer(HOTELS_LAYER) ? HOTELS_LAYER : undefined;
      map.addLayer(
        {
          id: ROUTES_LAYER,
          type: "line",
          source: ROUTES_SRC,
          paint: {
            "line-color": ["case", ["get", "matched"], ["get", "color"], "#9ca3af"],
            "line-width": ["case", ["get", "matched"], 4, 1],
            "line-opacity": ["case", ["get", "matched"], 0.95, 0.45],
          },
          layout: { "line-cap": "round", "line-join": "round" },
        },
        beforeId
      );
    }
    if (!map.getLayer(ROUTES_HIT_LAYER)) {
      // Invisible 14px-wide layer for hover/click — makes thin polylines
      // easy to grab without thickening the visible style.
      map.addLayer(
        {
          id: ROUTES_HIT_LAYER,
          type: "line",
          source: ROUTES_SRC,
          paint: {
            "line-color": "#000",
            "line-width": 14,
            "line-opacity": 0,
          },
          layout: { "line-cap": "round", "line-join": "round" },
        },
        ROUTES_LAYER // hit layer goes BELOW visible so MapLibre's z-order
        // doesn't visually cover the colored line
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
