"use client";

import { create } from "zustand";
import type { ItineraryLeg, Lodging, Route } from "@/lib/types";
import { isHotelEndpoint } from "@/lib/types";

export interface PlannerState {
  // Catalog
  lodging: Lodging[];
  precomputedRoutes: Route[];

  // Trip
  itineraryId: string | null;
  name: string;
  legs: ItineraryLeg[];

  // UI
  pickingLegIndex: number | null;

  // Actions
  setCatalog: (lodging: Lodging[], routes: Route[]) => void;
  loadItinerary: (id: string | null, name: string, legs: ItineraryLeg[]) => void;
  newItinerary: () => void;
  setName: (n: string) => void;
  addLeg: () => void;
  removeLeg: (index: number) => void;
  moveLeg: (from: number, to: number) => void;
  setLeg: (index: number, leg: ItineraryLeg) => void;
  setLegFromHotel: (index: number, hotelId: string | null) => void;
  setLegToHotel: (index: number, hotelId: string) => void;
  setLegFromCustom: (index: number, lat: number, lon: number, label: string) => void;
  beginPicking: (index: number) => void;
  cancelPicking: () => void;
}

export const usePlanner = create<PlannerState>((set) => ({
  lodging: [],
  precomputedRoutes: [],
  itineraryId: null,
  name: "Untitled trip",
  legs: [],
  pickingLegIndex: null,

  setCatalog: (lodging, precomputedRoutes) => set({ lodging, precomputedRoutes }),

  loadItinerary: (id, name, legs) =>
    set({ itineraryId: id, name, legs, pickingLegIndex: null }),

  newItinerary: () =>
    set({
      itineraryId: null,
      name: "Untitled trip",
      legs: [],
      pickingLegIndex: null,
    }),

  setName: (n) => set({ name: n }),

  addLeg: () =>
    set((s) => {
      const prev = s.legs[s.legs.length - 1];
      const from: ItineraryLeg["from"] = prev
        ? { kind: "hotel", id: prev.to.id }
        : { kind: "hotel", id: s.lodging[0]?.id ?? "" };
      const to: ItineraryLeg["to"] = { kind: "hotel", id: "" };
      return { legs: [...s.legs, { from, to }] };
    }),

  removeLeg: (index) =>
    set((s) => {
      const legs = s.legs.slice();
      legs.splice(index, 1);
      // Cascade: re-mirror downstream "from" fields where they should auto-mirror.
      return { legs: rewireMirroredStarts(legs) };
    }),

  moveLeg: (from, to) =>
    set((s) => {
      const legs = s.legs.slice();
      const [item] = legs.splice(from, 1);
      legs.splice(to, 0, item);
      return { legs: rewireMirroredStarts(legs) };
    }),

  setLeg: (index, leg) =>
    set((s) => {
      const legs = s.legs.slice();
      legs[index] = leg;
      return { legs: rewireMirroredStarts(legs) };
    }),

  setLegFromHotel: (index, hotelId) =>
    set((s) => {
      const legs = s.legs.slice();
      legs[index] = {
        ...legs[index],
        from: hotelId ? { kind: "hotel", id: hotelId } : legs[index].from,
      };
      return { legs };
    }),

  setLegToHotel: (index, hotelId) =>
    set((s) => {
      const legs = s.legs.slice();
      legs[index] = { ...legs[index], to: { kind: "hotel", id: hotelId } };
      return { legs: rewireMirroredStarts(legs) };
    }),

  setLegFromCustom: (index, lat, lon, label) =>
    set((s) => {
      const legs = s.legs.slice();
      legs[index] = { ...legs[index], from: { kind: "custom", lat, lon, label } };
      return { legs };
    }),

  beginPicking: (index) => set({ pickingLegIndex: index }),
  cancelPicking: () => set({ pickingLegIndex: null }),
}));

// For legs after the first, auto-set "from" to mirror the previous leg's "to"
// when the previous leg's destination is a hotel. Custom-start legs are
// preserved (only the first leg can have a custom start in the spec, but we
// keep it general).
function rewireMirroredStarts(legs: ItineraryLeg[]): ItineraryLeg[] {
  const out = legs.slice();
  for (let i = 1; i < out.length; i++) {
    const prevTo = out[i - 1].to;
    const curFrom = out[i].from;
    // Only auto-mirror if current "from" is a hotel (i.e. user didn't customize it).
    if (prevTo.kind === "hotel" && isHotelEndpoint(curFrom)) {
      if (curFrom.id !== prevTo.id) {
        out[i] = { ...out[i], from: { kind: "hotel", id: prevTo.id } };
      }
    }
  }
  return out;
}

// Find a precomputed route between two hotels (either ordering).
export function findPrecomputedRoute(
  routes: Route[],
  aId: string,
  bId: string
): Route | null {
  return (
    routes.find(
      (r) =>
        (r.aId === aId && r.bId === bId) || (r.aId === bId && r.bId === aId)
    ) ?? null
  );
}

// Compute trip totals.
export function tripTotals(legs: ItineraryLeg[]): {
  distanceMi: number;
  durationMin: number;
  gainFt: number;
  days: number;
} {
  let distanceMi = 0;
  let durationMin = 0;
  let gainFt = 0;
  for (const l of legs) {
    distanceMi += l.distanceMi ?? 0;
    durationMin += l.durationMin ?? 0;
    gainFt += l.gainFt ?? 0;
  }
  return { distanceMi, durationMin, gainFt, days: legs.length };
}
