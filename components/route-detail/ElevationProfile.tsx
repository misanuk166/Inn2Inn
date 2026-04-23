"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ElevationSample } from "@/lib/types";

export function ElevationProfile({
  profile,
  reversed,
}: {
  profile: ElevationSample[];
  reversed: boolean;
}) {
  const data = useMemo(() => {
    if (!reversed || profile.length === 0) return profile;
    const total = profile[profile.length - 1].distMi;
    return profile
      .slice()
      .reverse()
      .map((s) => ({ distMi: total - s.distMi, elevFt: s.elevFt }));
  }, [profile, reversed]);

  if (data.length < 2) {
    return <p className="text-xs text-zinc-500">No elevation data for this route.</p>;
  }

  const maxElev = Math.max(...data.map((s) => s.elevFt));
  const minElev = Math.min(...data.map((s) => s.elevFt));

  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="elev-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity={0.7} />
              <stop offset="100%" stopColor="#10b981" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="distMi"
            type="number"
            domain={[0, "dataMax"]}
            tickFormatter={(v) => `${(v as number).toFixed(1)}`}
            tickLine={false}
            axisLine={false}
            stroke="#a1a1aa"
            fontSize={10}
            label={{ value: "miles", position: "insideBottom", offset: 0, fontSize: 10, fill: "#71717a" }}
          />
          <YAxis
            domain={[Math.floor(minElev / 100) * 100, Math.ceil(maxElev / 100) * 100]}
            tickFormatter={(v) => `${(v as number).toLocaleString()}`}
            tickLine={false}
            axisLine={false}
            stroke="#a1a1aa"
            width={48}
            fontSize={10}
            label={{ value: "ft", angle: -90, position: "insideLeft", fontSize: 10, fill: "#71717a" }}
          />
          <Tooltip
            cursor={{ stroke: "#71717a", strokeDasharray: "2 2" }}
            contentStyle={{
              background: "#fff",
              border: "1px solid #e4e4e7",
              borderRadius: 6,
              fontSize: 11,
            }}
            formatter={(v) => [`${Number(v).toLocaleString()} ft`, "Elevation"]}
            labelFormatter={(v) => `${Number(v).toFixed(2)} mi`}
          />
          <Area
            type="monotone"
            dataKey="elevFt"
            stroke="#059669"
            strokeWidth={2}
            fill="url(#elev-fill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
