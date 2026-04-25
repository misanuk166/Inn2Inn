"use client";

import { useCallback, useEffect, useState } from "react";
import type { Region } from "@/lib/types";
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
}: {
  region: Region;
  regions: Region[];
}) {
  // Lodging + routes now stream in via useViewportData (mounted inside
  // ExplorerMap). The page no longer SSRs the bulk catalog — it would melt
  // at non-Marin scale (10K+ routes per region).
  const selectedHotel = useExplorer((s) => s.selectedHotel);

  const [leftWidth, setLeftWidth] = useState(LEFT_DEFAULT);
  const [rightWidth, setRightWidth] = useState(RIGHT_DEFAULT);

  // Hydrate widths from localStorage after mount. Setting state inside the
  // effect is intentional here — using localStorage in lazy useState init
  // would cause an SSR/client hydration mismatch.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const l = Number(localStorage.getItem(LEFT_KEY));
    if (Number.isFinite(l) && l > 0) setLeftWidth(clamp(l));
    const r = Number(localStorage.getItem(RIGHT_KEY));
    if (Number.isFinite(r) && r > 0) setRightWidth(clamp(r));
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    localStorage.setItem(LEFT_KEY, String(leftWidth));
  }, [leftWidth]);
  useEffect(() => {
    localStorage.setItem(RIGHT_KEY, String(rightWidth));
  }, [rightWidth]);

  // Reset store when region changes so we don't show stale pins from the
  // previous region while the new viewport's data loads.
  const setData = useExplorer((s) => s.setData);
  useEffect(() => {
    setData([], []);
  }, [region.slug, setData]);

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
        <ExplorerMap initialBbox={region.bbox} regionSlug={region.slug} />
      </div>
      {selectedHotel && (
        <>
          <ResizeHandle onDelta={onRightDelta} label="Resize hotel panel" />
          <HotelPanel widthPx={rightWidth} />
        </>
      )}
    </div>
  );
}
