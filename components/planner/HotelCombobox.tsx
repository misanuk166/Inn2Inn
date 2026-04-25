"use client";

import { useEffect, useRef, useState } from "react";
import type { Lodging } from "@/lib/types";

export interface HotelComboboxProps {
  value: { id: string; name: string } | null;
  onChange: (hotel: { id: string; name: string } | null) => void;
  placeholder?: string;
  className?: string;
}

const DEBOUNCE_MS = 200;
const MIN_QUERY = 2;

/**
 * Typeahead combobox for selecting a hotel by name. Hits /api/lodging/search?q=
 * with a 200ms debounce. Designed to scale: never preloads the full catalog,
 * which would be ~2000 rows at CA scale.
 */
export function HotelCombobox({
  value,
  onChange,
  placeholder = "Search hotels…",
  className = "",
}: HotelComboboxProps) {
  const [query, setQuery] = useState(value?.name ?? "");
  const [results, setResults] = useState<Lodging[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const aborter = useRef<AbortController | null>(null);

  // Re-sync query when the controlled value changes externally (e.g. cleared).
  // setQuery in an effect is intentional: the input is locally controlled
  // (free-form typing) but must reset when the parent clears the selection.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setQuery(value?.name ?? "");
  }, [value?.id, value?.name]);

  // Debounced search.
  useEffect(() => {
    if (!open) return;
    if (query.length < MIN_QUERY) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      aborter.current?.abort();
      aborter.current = new AbortController();
      try {
        const res = await fetch(
          `/api/lodging/search?q=${encodeURIComponent(query)}`,
          { signal: aborter.current.signal }
        );
        const j = (await res.json()) as { lodging?: Lodging[] };
        setResults(j.lodging ?? []);
        setActiveIdx(-1);
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          console.error("[HotelCombobox] search failed:", e);
        }
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query, open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Close on outside click.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function pick(h: Lodging) {
    onChange({ id: h.id, name: h.name });
    setQuery(h.name);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(-1, i - 1));
    } else if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault();
      pick(results[activeIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) setOpen(true);
          if (e.target.value === "") onChange(null);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs"
      />
      {open && query.length >= MIN_QUERY && results.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-md border border-zinc-200 bg-white shadow-lg">
          {results.map((h, i) => (
            <li
              key={h.id}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(h);
              }}
              onMouseEnter={() => setActiveIdx(i)}
              className={
                "cursor-pointer px-3 py-1.5 text-xs " +
                (i === activeIdx ? "bg-emerald-50 text-emerald-900" : "text-zinc-800")
              }
            >
              <div className="font-medium">{h.name}</div>
              {(h.city || h.regionSlug) && (
                <div className="text-[10px] text-zinc-500">
                  {h.city ?? h.regionSlug}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {open && query.length >= MIN_QUERY && results.length === 0 && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-500 shadow-lg">
          No matches
        </div>
      )}
    </div>
  );
}
