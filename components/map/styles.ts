// MapLibre style definitions. All options listed here are free and require
// no API key. To override any kind with a custom MapTiler / Stadia / etc.
// style URL, set NEXT_PUBLIC_MAP_STYLE_URL_<KIND> (uppercased).

import type { StyleSpecification } from "maplibre-gl";

export type MapStyleKind =
  | "outdoor"   // topo with contours + hillshade — best for hiking
  | "streets"   // default detailed OSM
  | "light"     // clean neutral light (good for colored route overlays)
  | "dark"      // dark theme
  | "satellite"; // aerial imagery

export const STYLE_LABELS: Record<MapStyleKind, string> = {
  outdoor: "Topo",
  streets: "Streets",
  light: "Light",
  dark: "Dark",
  satellite: "Satellite",
};

export const ALL_STYLES: MapStyleKind[] = [
  "outdoor",
  "streets",
  "light",
  "dark",
  "satellite",
];

// OpenFreeMap — vector tiles, free, no key.
const OFM = "https://tiles.openfreemap.org/styles";

// Inline raster style for OpenTopoMap. OpenTopoMap is a volunteer raster
// tileset purpose-built for hiking with contour lines, relief, and trails
// prominently styled — the right background for this app.
const OPENTOPOMAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    opentopomap: {
      type: "raster",
      tiles: [
        "https://a.tile.opentopomap.org/{z}/{x}/{y}.png",
        "https://b.tile.opentopomap.org/{z}/{x}/{y}.png",
        "https://c.tile.opentopomap.org/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      maxzoom: 17,
      attribution:
        "© <a href=\"https://opentopomap.org\">OpenTopoMap</a> " +
        "(<a href=\"https://creativecommons.org/licenses/by-sa/3.0/\">CC-BY-SA</a>) · " +
        "Map data © <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a>",
    },
  },
  layers: [{ id: "opentopomap", type: "raster", source: "opentopomap" }],
  glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
};

// Inline raster style for Esri World Imagery satellite. Free for non-commercial
// use with attribution.
const SATELLITE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    satellite: {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution:
        "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
    },
  },
  layers: [{ id: "satellite", type: "raster", source: "satellite" }],
  glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
};

export function styleFor(kind: MapStyleKind): string | StyleSpecification {
  const override = process.env[`NEXT_PUBLIC_MAP_STYLE_URL_${kind.toUpperCase()}`];
  if (override) return override;
  switch (kind) {
    case "outdoor":
      return OPENTOPOMAP_STYLE;
    case "streets":
      return `${OFM}/liberty`;
    case "light":
      return `${OFM}/positron`;
    case "dark":
      return `${OFM}/dark`;
    case "satellite":
      return SATELLITE_STYLE;
  }
}

/** @deprecated use styleFor */
export function styleUrl(kind: MapStyleKind): string {
  const s = styleFor(kind);
  return typeof s === "string" ? s : "";
}
