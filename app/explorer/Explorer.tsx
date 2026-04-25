"use client";

import { useEffect } from "react";
import type { Lodging, Region, Route } from "@/lib/types";
import { useExplorer } from "@/components/explorer/store";
import { Sidebar } from "@/components/explorer/Sidebar";
import { ExplorerMap } from "@/components/explorer/ExplorerMap";
import { HotelPanel } from "@/components/explorer/HotelPanel";

export function Explorer({
  region,
  regions,
  lodging,
  routes,
}: {
  region: Region;
  regions: Region[];
  lodging: Lodging[];
  routes: Route[];
}) {
  const setData = useExplorer((s) => s.setData);
  const selectedHotelId = useExplorer((s) => s.selectedHotelId);

  useEffect(() => {
    setData(lodging, routes);
  }, [lodging, routes, setData]);

  return (
    <div className="flex min-h-0 flex-1 flex-row">
      <Sidebar regions={regions} regionSlug={region.slug} />
      <div className="relative min-h-0 flex-1">
        <ExplorerMap initialBbox={region.bbox} />
      </div>
      {selectedHotelId && <HotelPanel />}
    </div>
  );
}
