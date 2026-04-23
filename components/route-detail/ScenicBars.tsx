"use client";

import type { ScenicSubScores } from "@/lib/types";

const LABELS: Record<keyof ScenicSubScores, string> = {
  naturalness: "Naturalness",
  elevation: "Elevation drama",
  water: "Water proximity",
  surface: "Trail surface",
  distance: "Distance sweet spot",
};

export function ScenicBars({ subScores }: { subScores: ScenicSubScores }) {
  const keys = Object.keys(LABELS) as Array<keyof ScenicSubScores>;
  return (
    <ul className="space-y-2">
      {keys.map((k) => {
        const v = Math.max(0, Math.min(20, subScores[k] ?? 0));
        return (
          <li key={k}>
            <div className="mb-1 flex items-baseline justify-between text-xs">
              <span className="text-zinc-700">{LABELS[k]}</span>
              <span className="font-semibold tabular-nums text-zinc-900">{Math.round(v)} / 20</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
              <div
                className="h-full bg-emerald-600"
                style={{ width: `${(v / 20) * 100}%` }}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={20}
                aria-valuenow={Math.round(v)}
                aria-label={LABELS[k]}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
