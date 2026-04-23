"use client";

import { useRouter } from "next/navigation";
import type { Region } from "@/lib/types";

export function RegionPicker({ regions, current }: { regions: Region[]; current: string }) {
  const router = useRouter();
  if (regions.length === 0) return null;

  return (
    <div>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
        Region
      </label>
      <select
        value={current}
        onChange={(e) => router.push(`/explorer?region=${e.target.value}`)}
        className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
      >
        {regions.map((r) => (
          <option key={r.slug} value={r.slug}>
            {r.name} ({r.routesCount} routes)
          </option>
        ))}
      </select>
    </div>
  );
}
