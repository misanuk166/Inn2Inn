// MapLibre style URLs. We use free demo styles by default — set
// NEXT_PUBLIC_MAP_STYLE_URL_<KIND> to override per kind in production.

export type MapStyleKind = "topo" | "light" | "dark" | "minimal";

const FALLBACK: Record<MapStyleKind, string> = {
  // Free demo styles maintained by MapLibre / open data providers.
  topo:    "https://tiles.openfreemap.org/styles/positron",
  light:   "https://tiles.openfreemap.org/styles/positron",
  dark:    "https://tiles.openfreemap.org/styles/dark",
  minimal: "https://tiles.openfreemap.org/styles/positron",
};

export function styleUrl(kind: MapStyleKind): string {
  const env = process.env[`NEXT_PUBLIC_MAP_STYLE_URL_${kind.toUpperCase()}`];
  return env || FALLBACK[kind];
}

export const STYLE_LABELS: Record<MapStyleKind, string> = {
  topo: "Topo",
  light: "Light",
  dark: "Dark",
  minimal: "Minimal",
};

export const ALL_STYLES: MapStyleKind[] = ["topo", "light", "dark", "minimal"];
