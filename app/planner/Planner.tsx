"use client";

import { useEffect } from "react";
import type { Lodging, Route } from "@/lib/types";
import { usePlanner } from "@/components/planner/store";
import { TripBuilder } from "@/components/planner/TripBuilder";
import { PlannerMap } from "@/components/planner/PlannerMap";

export function Planner({
  lodging,
  routes,
}: {
  lodging: Lodging[];
  routes: Route[];
}) {
  const setCatalog = usePlanner((s) => s.setCatalog);

  useEffect(() => {
    setCatalog(lodging, routes);
  }, [lodging, routes, setCatalog]);

  return (
    <div className="grid h-full min-h-0 flex-1 grid-cols-[minmax(360px,440px)_1fr]">
      <TripBuilder />
      <PlannerMap />
    </div>
  );
}
