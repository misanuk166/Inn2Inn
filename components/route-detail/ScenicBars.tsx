"use client";

import type { ScenicSubScores } from "@/lib/types";

// Order matches the sub-score weights (heaviest first). Each bar shows the
// raw 0..20 value so axes are comparable; the actual contribution to total
// score is weighted (see lib/scoring.ts).
const ORDERED: Array<{ key: keyof ScenicSubScores; label: string; weightX: number }> = [
  { key: "surface",     label: "Trail surface",     weightX: 1.75 },
  { key: "naturalness", label: "Naturalness",       weightX: 1.25 },
  { key: "elevation",   label: "Elevation drama",   weightX: 1.0 },
  { key: "water",       label: "Water proximity",   weightX: 1.0 },
];

export function ScenicBars({ subScores }: { subScores: ScenicSubScores }) {
  return (
    <ul className="space-y-2">
      {ORDERED.map(({ key, label, weightX }) => {
        const v = Math.max(0, Math.min(20, subScores[key] ?? 0));
        return (
          <li key={key}>
            <div className="mb-1 flex items-baseline justify-between text-xs">
              <span className="text-zinc-700">
                {label}
                {weightX > 1 && (
                  <span className="ml-1 text-[10px] text-zinc-400">×{weightX}</span>
                )}
              </span>
              <span className="font-semibold tabular-nums text-zinc-900">
                {Math.round(v)} / 20
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
              <div
                className="h-full bg-emerald-600"
                style={{ width: `${(v / 20) * 100}%` }}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={20}
                aria-valuenow={Math.round(v)}
                aria-label={label}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
