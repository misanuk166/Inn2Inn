"use client";

import { useEffect } from "react";
import type { Lodging } from "@/lib/types";
import { usePlanner } from "@/components/planner/store";
import { TripBuilder } from "@/components/planner/TripBuilder";
import { PlannerMap } from "@/components/planner/PlannerMap";

export function Planner() {
  const legs = usePlanner((s) => s.legs);
  const hotelById = usePlanner((s) => s.hotelById);
  const cacheHotels = usePlanner((s) => s.cacheHotels);

  // Whenever legs reference a hotel id we don't have cached info for (e.g.
  // after loading a saved itinerary), fetch them in one batch.
  useEffect(() => {
    const missing = new Set<string>();
    for (const l of legs) {
      if (l.from.kind === "hotel" && l.from.id && !hotelById[l.from.id]) {
        missing.add(l.from.id);
      }
      if (l.to.id && !hotelById[l.to.id]) missing.add(l.to.id);
    }
    if (missing.size === 0) return;
    fetch(`/api/lodging?ids=${[...missing].join(",")}`)
      .then((r) => r.json())
      .then((j: { lodging?: Lodging[] }) => {
        if (j.lodging?.length) cacheHotels(j.lodging);
      })
      .catch(() => {
        /* combobox will show "(loading…)" until the user re-selects */
      });
  }, [legs, hotelById, cacheHotels]);

  return (
    <div className="flex min-h-0 flex-1 flex-row">
      <TripBuilder />
      <div className="relative min-h-0 flex-1">
        <PlannerMap />
      </div>
    </div>
  );
}
