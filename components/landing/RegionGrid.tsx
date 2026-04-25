"use client";

import Link from "next/link";
import type { Region } from "@/lib/types";

export function RegionGrid({ regions }: { regions: Region[] }) {
  if (regions.length === 0) return null;
  // Sort by route count descending so the richest regions show first.
  const sorted = regions.slice().sort((a, b) => b.routesCount - a.routesCount);
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {sorted.map((r) => (
        <li key={r.slug}>
          <Link
            href={`/explorer?region=${r.slug}`}
            className="group flex h-full flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm transition-shadow hover:shadow-md"
          >
            <div
              aria-hidden
              className="h-28 w-full"
              style={{ background: gradientForSlug(r.slug) }}
            />
            <div className="flex flex-1 flex-col gap-1 p-4">
              <h3 className="text-base font-semibold text-zinc-900 group-hover:text-emerald-700">
                {r.name}
              </h3>
              <p className="text-xs text-zinc-500">
                {r.routesCount.toLocaleString()} {r.routesCount === 1 ? "route" : "routes"}
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

// Stable per-region gradient — gives each card a recognizable visual identity
// without needing per-region photos.
function gradientForSlug(slug: string): string {
  const palettes: Array<[string, string]> = [
    ["#10b981", "#0ea5e9"],
    ["#f59e0b", "#d97706"],
    ["#ec4899", "#a855f7"],
    ["#0d9488", "#1e40af"],
    ["#84cc16", "#16a34a"],
    ["#06b6d4", "#0e7490"],
    ["#dc2626", "#9f1239"],
    ["#7c3aed", "#4f46e5"],
  ];
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  const [a, b] = palettes[h % palettes.length];
  return `linear-gradient(135deg, ${a}, ${b})`;
}
