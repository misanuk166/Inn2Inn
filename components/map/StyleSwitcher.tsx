"use client";

import { ALL_STYLES, STYLE_LABELS, type MapStyleKind } from "./styles";

export function StyleSwitcher({
  value,
  onChange,
}: {
  value: MapStyleKind;
  onChange: (k: MapStyleKind) => void;
}) {
  return (
    <div className="flex overflow-hidden rounded-md border border-zinc-200 bg-white text-xs shadow-sm">
      {ALL_STYLES.map((kind) => (
        <button
          key={kind}
          type="button"
          onClick={() => onChange(kind)}
          className={
            "px-2.5 py-1 transition-colors " +
            (value === kind
              ? "bg-emerald-600 text-white"
              : "text-zinc-700 hover:bg-zinc-100")
          }
          aria-pressed={value === kind}
        >
          {STYLE_LABELS[kind]}
        </button>
      ))}
    </div>
  );
}
