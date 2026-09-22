"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { itemHistoryGeometry, nearestHistoryPoint, type ItemHistoryPoint } from "@/lib/item-history";
import { economyDate, economyNumber } from "@/lib/economy";

export function EconomyChart({ title, points, unit = "Gold Coins", daily = false, sampled = false }: {
  title: string; points: ItemHistoryPoint[]; unit?: string; daily?: boolean; sampled?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(500);
  const [active, setActive] = useState<number | null>(null);
  useEffect(() => {
    const observer = new ResizeObserver(entries => setWidth(Math.max(240, entries[0].contentRect.width)));
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  const graph = itemHistoryGeometry({ item_id: "economy", period: "all", total: points.at(-1)?.total ?? null,
    tracked_since: points[0]?.at ?? null, from: points[0]?.at ?? new Date(0).toISOString(),
    to: points.at(-1)?.at ?? new Date(0).toISOString(), sampled, points: daily && points.length ? [{ at: points[0].at, total: "0" }, ...points] : points }, width);
  if (daily && points.length) graph.points.shift();
  const index = Math.max(0, Math.min(active ?? points.length - 1, points.length - 1));
  const selected = graph.points[index];
  const maxGap = sampled ? (graph.end - graph.start) / 498 * 2 + 600000 : 600000;
  const line = graph.points.map((p, i, all) => (i === 0 || (!daily && Date.parse(p.at) - Date.parse(all[i - 1].at) > maxGap) ? "M " : "L ") + p.x + " " + p.y).join(" ");
  function pointer(event: PointerEvent<HTMLDivElement>) {
    const x = event.clientX - event.currentTarget.getBoundingClientRect().left;
    setActive(nearestHistoryPoint(points, graph.start + Math.max(0, Math.min(1, (x - graph.left) / (graph.right - graph.left))) * (graph.end - graph.start)));
  }
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    const next = event.key === "ArrowLeft" ? index - 1 : event.key === "ArrowRight" ? index + 1 : event.key === "Home" ? 0 : event.key === "End" ? points.length - 1 : null;
    if (next === null) return;
    event.preventDefault(); setActive(Math.max(0, Math.min(points.length - 1, next)));
  }
  return <section className="admin-card economy-chart-card" aria-label={title}>
    <h3>{title}</h3>
    <div className="economy-chart-readout"><strong>{economyNumber(selected?.total ?? null)}</strong> <span>{unit}</span>
      <small>{selected ? (daily ? selected.at.slice(0, 10) + " UTC" : economyDate(selected.at)) : "No observations yet"}</small></div>
    <div ref={ref} className="economy-chart" role="slider" tabIndex={0} aria-label={title + " timeline"}
      aria-valuemin={0} aria-valuemax={Math.max(0, points.length - 1)} aria-valuenow={index}
      aria-valuetext={selected ? economyDate(selected.at) + ": " + economyNumber(selected.total) + " " + unit : "No observations"}
      onPointerMove={pointer} onPointerDown={pointer} onPointerLeave={() => setActive(null)} onKeyDown={keyboard}>
      <svg viewBox={`0 0 ${width} ${graph.height}`} width="100%" height={graph.height} aria-hidden="true">
        {graph.yTicks.map(t => <g key={t.y}><line className="economy-grid" x1={graph.left} x2={graph.right} y1={t.y} y2={t.y}/><text x={graph.left - 8} y={t.y + 4} textAnchor="end">{t.label}</text></g>)}
        {daily ? graph.points.map(p => <line key={p.at} className="economy-bar" x1={p.x} x2={p.x} y1={p.y} y2={graph.bottom} strokeWidth={Math.max(2, (graph.right - graph.left) / 45)} />)
          : <path className="economy-line" d={line} />}
        {graph.xTicks.map((t, i) => <text key={i} x={t.x} y={graph.bottom + 23} textAnchor={t.anchor as "start" | "middle" | "end"}>{t.date}{t.time && <tspan x={t.x} dy="16">{t.time}</tspan>}</text>)}
        {selected && <g><line className="economy-cursor" x1={selected.x} x2={selected.x} y1={graph.top} y2={graph.bottom}/><circle cx={selected.x} cy={selected.y} r="4" className="economy-dot"/></g>}
      </svg>
    </div>
    <small>{daily ? "Daily completed sales. Today is partial." : "Observed totals. Gaps indicate missing measurements."} Hover, tap or use arrow keys.</small>
  </section>;
}
