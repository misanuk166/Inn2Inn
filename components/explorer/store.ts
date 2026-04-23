"use client";

import { create } from "zustand";
import type { Lodging, Route, ScenicCategory } from "@/lib/types";

export type RatingFilter =
  | "all"
  | "highly_only"
  | "scenic_and_above"
  | "moderate_and_above"
  | "urban_only";

export interface ExplorerState {
  // Data
  lodging: Lodging[];
  routes: Route[];
  // Filters
  endpointHotelId: string | null;
  endpointDirection: "depart" | "arrive";
  rating: RatingFilter;
  maxDistance: number;        // miles
  maxGain: number;            // feet
  // UI
  selectedHotelId: string | null;

  setData: (lodging: Lodging[], routes: Route[]) => void;
  setEndpointHotel: (id: string | null) => void;
  toggleDirection: () => void;
  setRating: (r: RatingFilter) => void;
  setMaxDistance: (n: number) => void;
  setMaxGain: (n: number) => void;
  setSelectedHotel: (id: string | null) => void;
}

const DEFAULT_MAX_DISTANCE = 12;
const DEFAULT_MAX_GAIN = 4000;

export const useExplorer = create<ExplorerState>((set) => ({
  lodging: [],
  routes: [],
  endpointHotelId: null,
  endpointDirection: "depart",
  rating: "all",
  maxDistance: DEFAULT_MAX_DISTANCE,
  maxGain: DEFAULT_MAX_GAIN,
  selectedHotelId: null,

  setData: (lodging, routes) => set({ lodging, routes }),
  setEndpointHotel: (id) => set({ endpointHotelId: id }),
  toggleDirection: () =>
    set((s) => ({ endpointDirection: s.endpointDirection === "depart" ? "arrive" : "depart" })),
  setRating: (r) => set({ rating: r }),
  setMaxDistance: (n) => set({ maxDistance: n }),
  setMaxGain: (n) => set({ maxGain: n }),
  setSelectedHotel: (id) => set({ selectedHotelId: id }),
}));

export function ratingMatches(cat: ScenicCategory, filter: RatingFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "highly_only":
      return cat === "highly_scenic";
    case "scenic_and_above":
      return cat === "scenic" || cat === "highly_scenic";
    case "moderate_and_above":
      return cat !== "urban_road";
    case "urban_only":
      return cat === "urban_road";
  }
}

export const RATING_LABELS: Record<RatingFilter, string> = {
  all: "All routes",
  highly_only: "Highly Scenic only",
  scenic_and_above: "Scenic and above",
  moderate_and_above: "Moderately Scenic and above",
  urban_only: "Urban / Road only",
};

// Returns the routes that pass all current filters.
export function selectFilteredRoutes(state: ExplorerState): Route[] {
  return state.routes
    .filter((r) => ratingMatches(r.category, state.rating))
    .filter((r) => r.distanceMi <= state.maxDistance)
    .filter((r) => r.gainFt <= state.maxGain)
    .filter((r) =>
      state.endpointHotelId
        ? r.aId === state.endpointHotelId || r.bId === state.endpointHotelId
        : true
    )
    .sort((a, b) => b.scenicScore - a.scenicScore);
}
