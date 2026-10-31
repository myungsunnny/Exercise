"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Datum = Record<string, string | number | null>;
const AXIS = { fontSize: 11, fill: "var(--muted-foreground)" };
const tooltipStyle = { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--popover-foreground)" };
const fmt = (v: unknown, unit: string) => (typeof v === "number" ? `${v.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}${unit}` : "-");

export function SimpleBarChart({ data, x, y, unit, height = 220, label }: { data: Datum[]; x: string; y: string; unit: string; height?: number; label: string }) {
  return (
    <div role="img" aria-label={label} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey={x} tick={AXIS} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={12} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => Number(v).toLocaleString("ko-KR", { notation: "compact" })} />
          <Tooltip cursor={{ fill: "var(--muted)" }} contentStyle={tooltipStyle} formatter={(v) => [fmt(v, unit), label]} />
          <Bar dataKey={y} fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SimpleLineChart({
  data, x, lines, unit, height = 240, label,
}: { data: Datum[]; x: string; lines: { key: string; name: string; color?: string; dashed?: boolean }[]; unit: string; height?: number; label: string }) {
  return (
    <div role="img" aria-label={label} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey={x} tick={AXIS} tickLine={false} axisLine={false} minTickGap={16} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} width={48} domain={["auto", "auto"]} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => [fmt(v, unit), name]} />
          {lines.map((l, i) => (
            <Line key={l.key} dataKey={l.key} name={l.name} type="monotone" stroke={l.color ?? `var(--chart-${i + 1})`} strokeWidth={2}
              strokeDasharray={l.dashed ? "4 4" : undefined} dot={{ r: 3 }} connectNulls />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
