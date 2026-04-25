"use client";

import { useCallback, useEffect, useState } from "react";
import type { Lodging, Region, Route } from "@/lib/types";
import { useExplorer } from "@/components/explorer/store";
import { Sidebar } from "@/components/explorer/Sidebar";
import { ExplorerMap } from "@/components/explorer/ExplorerMap";
import { HotelPanel } from "@/components/explorer/HotelPanel";
import { ResizeHandle } from "@/components/ResizeHandle";

const LEFT_KEY = "inn2inn:explorer:leftWidth";
const RIGHT_KEY = "inn2inn:explorer:rightWidth";
const LEFT_DEFAULT = 380;
const RIGHT_DEFAULT = 380;
const MIN = 280;
const MAX = 600;

function clamp(n: number) {
  return Math.max(MIN, Math.min(MAX, n));
}

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

  const [leftWidth, setLeftWidth] = useState(LEFT_DEFAULT);
  const [rightWidth, setRightWidth] = useState(RIGHT_DEFAULT);

  // Hydrate widths from localStorage on mount.
  useEffect(() => {
    const l = Number(localStorage.getItem(LEFT_KEY));
    if (Number.isFinite(l) && l > 0) setLeftWidth(clamp(l));
    const r = Number(localStorage.getItem(RIGHT_KEY));
    if (Number.isFinite(r) && r > 0) setRightWidth(clamp(r));
  }, []);

  // Persist widths.
  useEffect(() => {
    localStorage.setItem(LEFT_KEY, String(leftWidth));
  }, [leftWidth]);
  useEffect(() => {
    localStorage.setItem(RIGHT_KEY, String(rightWidth));
  }, [rightWidth]);

  useEffect(() => {
    setData(lodging, routes);
  }, [lodging, routes, setData]);

  const onLeftDelta = useCallback(
    (dx: number) => setLeftWidth((w) => clamp(w + dx)),
    []
  );
  const onRightDelta = useCallback(
    (dx: number) => setRightWidth((w) => clamp(w - dx)),
    []
  );

  return (
    <div className="flex min-h-0 flex-1 flex-row">
      <Sidebar regions={regions} regionSlug={region.slug} widthPx={leftWidth} />
      <ResizeHandle onDelta={onLeftDelta} label="Resize filters sidebar" />
      <div className="relative min-h-0 flex-1">
        <ExplorerMap initialBbox={region.bbox} />
      </div>
      {selectedHotelId && (
        <>
          <ResizeHandle onDelta={onRightDelta} label="Resize hotel panel" />
          <HotelPanel widthPx={rightWidth} />
        </>
      )}
    </div>
  );
}
