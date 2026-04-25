"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { Map as MlMap, MapMouseEvent } from "maplibre-gl";
import { useRouter } from "next/navigation";
import type { Route } from "@/lib/types";
import { SCENIC_CATEGORY_COLOR, SCENIC_CATEGORY_LABEL } from "@/lib/types";
import { Map as MapComponent, setOrUpdateGeoJsonSource } from "@/components/map/Map";
import { filterRoutes, useExplorer } from "./store";
import { useViewportData } from "./useViewportData";
import type { Bbox } from "@/lib/types";

const ROUTES_SRC = "explorer-routes";
const ROUTES_LAYER = "explorer-routes-layer";
const ROUTES_HIT_LAYER = "explorer-routes-hit";
const HOTELS_SRC = "explorer-hotels";
const HOTELS_LAYER = "explorer-hotels-layer";
const HOTELS_LABEL_LAYER = "explorer-hotels-label";
const HOTELS_CLUSTER_LAYER = "explorer-hotels-clusters";
const HOTELS_CLUSTER_COUNT_LAYER = "explorer-hotels-cluster-count";
// Below this zoom we skip route polyline rendering — at statewide views
// thousands of overlapping lines are noise. Hotel clusters still tell the
// story of "where the routes are."
const ROUTES_MIN_ZOOM = 9;

export function ExplorerMap({
  initialBbox,
  regionSlug,
}: {
  initialBbox?: Bbox;
  regionSlug: string;
}) {
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
  const [mapInstance, setMapInstance] = useState<MlMap | null>(null);
  const [styleReady, setStyleReady] = useState(0);

  // Viewport-driven data: fetches /api/lodging?bbox= and /api/routes?bbox=
  // on every settled pan/zoom, with a quantized-bbox LRU cache. The store's
  // lodging/routes are the current viewport; Sidebar reads from there.
  useViewportData(mapInstance, regionSlug);

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
      setMapInstance(map);
      setStyleReady((n) => n + 1);

      const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 8,
        className: "explorer-route-popup",
      });

      // Hotels — individual + cluster.
      map.off("click", HOTELS_LAYER, onHotelClick);
      map.on("click", HOTELS_LAYER, onHotelClick);
      map.off("mouseenter", HOTELS_LAYER, onHotelEnter);
      map.on("mouseenter", HOTELS_LAYER, onHotelEnter);
      map.off("mouseleave", HOTELS_LAYER, onHotelLeave);
      map.on("mouseleave", HOTELS_LAYER, onHotelLeave);
      map.off("click", HOTELS_CLUSTER_LAYER, onClusterClick);
      map.on("click", HOTELS_CLUSTER_LAYER, onClusterClick);
      map.off("mouseenter", HOTELS_CLUSTER_LAYER, onHotelEnter);
      map.on("mouseenter", HOTELS_CLUSTER_LAYER, onHotelEnter);
      map.off("mouseleave", HOTELS_CLUSTER_LAYER, onHotelLeave);
      map.on("mouseleave", HOTELS_CLUSTER_LAYER, onHotelLeave);

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
        // Look up full Lodging from the current viewport's lodging — cached
        // in the store so the panel survives subsequent viewport changes.
        const hotel = useExplorer.getState().lodging.find((l) => l.id === id) ?? null;
        if (!hotel) return;
        setSelectedHotel(hotel);
        setEndpointHotel(id);
      }
      function onClusterClick(
        e: MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }
      ) {
        const f = e.features?.[0];
        if (!f) return;
        const clusterId = (f.properties as { cluster_id?: number }).cluster_id;
        if (clusterId === undefined) return;
        const src = map.getSource(HOTELS_SRC) as maplibregl.GeoJSONSource;
        src.getClusterExpansionZoom(clusterId).then((zoom) => {
          const coords = (f.geometry as GeoJSON.Point).coordinates as [number, number];
          map.easeTo({ center: coords, zoom: Math.min(16, zoom + 0.5) });
        });
      }
      function onMapClick(e: MapMouseEvent) {
        // Layer-specific handlers fire first; if a marker, cluster, or route
        // was hit, skip the background-clear behavior.
        const hits = map.queryRenderedFeatures(e.point, {
          layers: [HOTELS_LAYER, HOTELS_CLUSTER_LAYER, ROUTES_HIT_LAYER],
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

  // Hotels source/layers — clustered so a CA-wide view doesn't try to render
  // thousands of overlapping markers. Three layers:
  //   1. Cluster bubbles (point_count > 1)
  //   2. Cluster count labels
  //   3. Individual hotel markers (cluster_id is unset)
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

    const existing = map.getSource(HOTELS_SRC) as maplibregl.GeoJSONSource | undefined;
    if (existing) {
      existing.setData(fc);
    } else {
      map.addSource(HOTELS_SRC, {
        type: "geojson",
        data: fc,
        cluster: true,
        clusterRadius: 50,
        // Clusters only at zoom ≤ 9 (statewide / multi-county view). By the
        // default Marin fit zoom (~10) and any single-county zoom, individual
        // markers show — clicks pin the hotel rather than expand a cluster.
        clusterMaxZoom: 9,
      });
    }

    if (!map.getLayer(HOTELS_CLUSTER_LAYER)) {
      map.addLayer({
        id: HOTELS_CLUSTER_LAYER,
        type: "circle",
        source: HOTELS_SRC,
        filter: ["has", "point_count"],
        paint: {
          // Bubble color + size step by count.
          "circle-color": [
            "step",
            ["get", "point_count"],
            "#10b981", // 1–9
            10, "#059669",
            50, "#047857",
            200, "#065f46",
          ],
          "circle-radius": [
            "step",
            ["get", "point_count"],
            14,
            10, 18,
            50, 24,
            200, 32,
          ],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
          "circle-opacity": 0.92,
        },
      });
    }
    if (!map.getLayer(HOTELS_CLUSTER_COUNT_LAYER)) {
      map.addLayer({
        id: HOTELS_CLUSTER_COUNT_LAYER,
        type: "symbol",
        source: HOTELS_SRC,
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-size": 12,
        },
        paint: {
          "text-color": "#ffffff",
        },
      });
    }
    if (!map.getLayer(HOTELS_LAYER)) {
      map.addLayer({
        id: HOTELS_LAYER,
        type: "circle",
        source: HOTELS_SRC,
        filter: ["!", ["has", "point_count"]],
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
        filter: ["!", ["has", "point_count"]],
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
          minzoom: ROUTES_MIN_ZOOM,
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
      map.addLayer(
        {
          id: ROUTES_HIT_LAYER,
          type: "line",
          source: ROUTES_SRC,
          minzoom: ROUTES_MIN_ZOOM,
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
