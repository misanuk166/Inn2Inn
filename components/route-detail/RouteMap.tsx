"use client";

import { useCallback } from "react";
import maplibregl, { Map as MlMap } from "maplibre-gl";
import bbox from "@turf/bbox";
import { Map, fitToBbox, setOrUpdateGeoJsonSource } from "@/components/map/Map";
import type { Bbox, Lodging, Poi, Route } from "@/lib/types";

const POI_COLORS: Record<Poi["kind"], string> = {
  restaurant: "#dc2626",
  cafe: "#d97706",
  viewpoint: "#2563eb",
  peak: "#7c3aed",
};

export function RouteMap({
  route,
  start,
  end,
  pois,
}: {
  route: Route;
  start: Lodging;
  end: Lodging;
  pois: Poi[];
}) {
  const handleReady = useCallback(
    (map: MlMap) => {
      // Polyline.
      setOrUpdateGeoJsonSource(map, "route", {
        type: "Feature",
        properties: {},
        geometry: route.polyline,
      });
      if (!map.getLayer("route-line")) {
        map.addLayer({
          id: "route-line",
          type: "line",
          source: "route",
          paint: {
            "line-color": "#059669",
            "line-width": 4,
          },
          layout: { "line-cap": "round", "line-join": "round" },
        });
      }

      // Endpoint markers.
      setOrUpdateGeoJsonSource(map, "endpoints", {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { role: "start", name: start.name },
            geometry: { type: "Point", coordinates: [start.lon, start.lat] },
          },
          {
            type: "Feature",
            properties: { role: "end", name: end.name },
            geometry: { type: "Point", coordinates: [end.lon, end.lat] },
          },
        ],
      });
      if (!map.getLayer("endpoints-circle")) {
        map.addLayer({
          id: "endpoints-circle",
          type: "circle",
          source: "endpoints",
          paint: {
            "circle-radius": 8,
            "circle-color": [
              "match",
              ["get", "role"],
              "start", "#10b981",
              "end", "#dc2626",
              "#0f172a",
            ],
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 2,
          },
        });
        map.addLayer({
          id: "endpoints-label",
          type: "symbol",
          source: "endpoints",
          layout: {
            "text-field": ["get", "name"],
            "text-size": 11,
            "text-offset": [0, 1.4],
            "text-anchor": "top",
          },
          paint: {
            "text-color": "#18181b",
            "text-halo-color": "#ffffff",
            "text-halo-width": 1.5,
          },
        });
      }

      // POIs.
      setOrUpdateGeoJsonSource(map, "pois", {
        type: "FeatureCollection",
        features: pois.map((p) => ({
          type: "Feature",
          properties: { kind: p.kind, name: p.name ?? "", color: POI_COLORS[p.kind] },
          geometry: { type: "Point", coordinates: [p.lon, p.lat] },
        })),
      });
      if (!map.getLayer("pois-circle")) {
        map.addLayer({
          id: "pois-circle",
          type: "circle",
          source: "pois",
          paint: {
            "circle-radius": 4,
            "circle-color": ["get", "color"],
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 1,
          },
        });
      }

      // Fit to polyline bounds with padding.
      const b = bbox({ type: "Feature", properties: {}, geometry: route.polyline }) as Bbox;
      fitToBbox(map, b, 60);

      // Hover popups for POIs.
      const popup = new maplibregl.Popup({ closeButton: false, offset: 8 });
      map.on("mousemove", "pois-circle", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const props = f.properties as { kind: Poi["kind"]; name: string };
        const coords = (f.geometry as GeoJSON.Point).coordinates as [number, number];
        popup
          .setLngLat(coords)
          .setHTML(
            `<div style="font-size:11px"><strong>${props.name || props.kind}</strong>` +
              (props.name ? ` <span style="color:#71717a">· ${props.kind}</span>` : "") +
              `</div>`
          )
          .addTo(map);
      });
      map.on("mouseleave", "pois-circle", () => popup.remove());
    },
    [route, start, end, pois]
  );

  return <Map onReady={handleReady} showStyleSwitcher={true} />;
}

export function poiLegendColor(kind: Poi["kind"]): string {
  return POI_COLORS[kind];
}
