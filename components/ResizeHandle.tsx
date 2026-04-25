"use client";

import { useCallback, useEffect, useRef } from "react";

export interface ResizeHandleProps {
  /** Called on every drag step with the cumulative pixel delta since dragstart. */
  onDelta: (deltaPx: number) => void;
  /** Optional aria-label for the handle. */
  label?: string;
}

/**
 * A 6px-wide vertical drag handle that sits between two columns. Drag right
 * for positive delta, drag left for negative delta. The parent applies the
 * delta to whichever sidebar this handle is anchored to (left sidebar grows
 * on positive delta; right sidebar grows on negative delta).
 */
export function ResizeHandle({ onDelta, label = "Resize" }: ResizeHandleProps) {
  const startXRef = useRef<number | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Pointer capture would constrain to this element's bounds, which the
      // user will frequently overshoot — handle on the document level instead.
      e.preventDefault();
      startXRef.current = e.clientX;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const onMove = (ev: PointerEvent) => {
        if (startXRef.current === null) return;
        onDelta(ev.clientX - startXRef.current);
        startXRef.current = ev.clientX;
      };
      const onUp = () => {
        startXRef.current = null;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [onDelta]
  );

  // Cleanup if the component unmounts mid-drag.
  useEffect(() => {
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, []);

  return (
    <div
      onPointerDown={onPointerDown}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      className="group relative z-10 w-1.5 shrink-0 cursor-col-resize bg-zinc-200 transition-colors hover:bg-emerald-400 active:bg-emerald-500"
    >
      {/* Wider invisible hit area so the handle is easy to grab. */}
      <div className="absolute inset-y-0 -left-1.5 -right-1.5" />
    </div>
  );
}
