"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Coins } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { useGameState } from "@/components/game-state";
import { itemHistoryDate, itemHistoryGeometry, itemHistoryPeriods, formatHistoryValue, nearestHistoryPoint,
  type ItemHistory, type ItemHistoryPeriod } from "@/lib/item-history";

// The plot reports the inspected point to the readout above it, so nothing covers the curve.
function HistoryPlot({ history, metric, fill, active, onActive }: {
  history: ItemHistory; metric: "circulation" | "value"; fill: string; active: number | null; onActive: (index: number | null) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    const observer = new ResizeObserver(entries => setWidth(entries[0].contentRect.width));
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const graph = itemHistoryGeometry(history, width);
  const last = graph.points.length - 1;
  const index = Math.min(active ?? last, last);
  const selected = graph.points[index];

  function point(event: PointerEvent<HTMLDivElement>) {
    const position = event.clientX - event.currentTarget.getBoundingClientRect().left;
    const fraction = Math.max(0, Math.min(1, (position - graph.left) / (graph.right - graph.left)));
    onActive(nearestHistoryPoint(history.points, graph.start + fraction * (graph.end - graph.start)));
  }
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    let next = index;
    if (event.key === "ArrowLeft") next--;
    else if (event.key === "ArrowRight") next++;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    else return;
    event.preventDefault();
    onActive(Math.max(0, Math.min(last, next)));
  }

  return <div ref={container} className="o-circulation-plot" role="slider" tabIndex={0}
    aria-label={metric === "value" ? "Market value history timeline" : "Circulation history timeline"} aria-orientation="horizontal"
    aria-valuemin={0} aria-valuemax={last} aria-valuenow={index}
    aria-valuetext={itemHistoryDate(selected.at) + ": " + formatHistoryValue(selected.total) + (selected.total === null ? "" : metric === "value" ? " Gold Coins" : " items")}
    onPointerMove={point} onPointerDown={point} onPointerLeave={() => onActive(null)}
    onFocus={() => onActive(last)} onBlur={() => onActive(null)} onKeyDown={keyboard}>
    <svg viewBox={"0 0 " + width + " " + graph.height} width="100%" height={graph.height} aria-hidden="true">
      <defs><linearGradient id={fill} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" className="o-chart-fill-top" /><stop offset="1" className="o-chart-fill-bottom" />
      </linearGradient></defs>
      {graph.yTicks.map(tick => <g key={tick.y}>
        <line className="o-chart-grid" x1={graph.left} x2={graph.right} y1={tick.y} y2={tick.y} />
        <text className="o-chart-label" x={graph.left - 9} y={tick.y + 4} textAnchor="end">{tick.label}</text>
      </g>)}
      <line className="o-chart-axis" x1={graph.left} x2={graph.right} y1={graph.bottom} y2={graph.bottom} />
      {graph.xTicks.map((tick, i) => <g key={i}>
        <text className="o-chart-label" x={tick.x} y={graph.bottom + 20} textAnchor={tick.anchor as "start" | "middle" | "end"}>{tick.date}</text>
        {tick.time && <text className="o-chart-label" x={tick.x} y={graph.bottom + 36} textAnchor={tick.anchor as "start" | "middle" | "end"}>{tick.time}</text>}
      </g>)}
      <path className="o-chart-area" d={graph.area} fill={"url(#" + fill + ")"} />
      <path className="o-chart-line" d={graph.line} />
      {active !== null && <line className="o-chart-cursor" x1={selected.x} x2={selected.x} y1={graph.top} y2={graph.bottom} />}
      {selected.total !== null && <g className="o-chart-marker" data-active={active !== null}>
        <circle className="o-chart-halo" cx={selected.x} cy={selected.y} r={8} />
        <circle className="o-chart-point" cx={selected.x} cy={selected.y} r={active === null ? 3 : 4} />
      </g>}
    </svg>
  </div>;
}

export function ItemHistoryChart({ itemId, name, total, id, metric }: {
  itemId: string; name: string; total: string | null; id: string; metric: "circulation" | "value";
}) {
  const [period, setPeriod] = useState<ItemHistoryPeriod>("all");
  const [attempt, setAttempt] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const [response, setResponse] = useState<{ key: string; data: ItemHistory | null; error: boolean } | null>(null);
  const { observed_at } = useGameState();
  const key = metric + ":" + itemId + ":" + period + ":" + attempt;
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const { data, error } = await createClient().rpc(metric === "value" ? "get_item_market_value" : "get_item_circulation", { target_item: itemId, period }).abortSignal(controller.signal);
        if (controller.signal.aborted) return;
        setResponse(previous => ({ key, data: data ?? (previous?.data?.item_id === itemId ? previous.data : null), error: !!error || !data }));
      } catch {
        if (!controller.signal.aborted) setResponse(previous => ({ key, data: previous?.data?.item_id === itemId ? previous.data : null, error: true }));
      }
    }
    void load();
    return () => controller.abort();
  }, [itemId, period, total, observed_at, attempt, key, metric]);
  const history = response?.data?.item_id === itemId ? response.data : null;
  const pending = response?.key !== key;
  const failed = !pending && response?.error;
  const selectedLabel = itemHistoryPeriods.find(option => option.id === period)!.label;
  const displayedLabel = itemHistoryPeriods.find(option => option.id === history?.period)?.label;
  // The readout shows the inspected point, or the latest one while the pointer is elsewhere.
  const points = history?.points ?? [];
  const shown = points.length ? points[Math.min(active ?? points.length - 1, points.length - 1)] : null;
  const value = shown ? shown.total : total;
  return <section className="o-circulation-chart" id={id} aria-label={name + (metric === "value" ? " market value history" : " circulation history")}>
    <div className="o-chart-head">
      <div className="o-chart-readout">
        <span>{metric === "value" ? "Average market value" : "Total in circulation"}
          {history?.sampled && <em title="Long histories are drawn from evenly spaced samples">Sampled</em>}</span>
        <div><strong>{metric === "value" && value !== null && <Coins aria-hidden="true" />}{formatHistoryValue(value)}</strong>
          {shown && <small>{itemHistoryDate(shown.at)}</small>}</div>
      </div>
      <fieldset className="o-chart-periods">
        <legend className="sr-only">{metric === "value" ? "Market value period" : "Circulation period"}</legend>
        {itemHistoryPeriods.map(option => <label key={option.id} title={option.label}>
          <input type="radio" name={id + "-period"} value={option.id} checked={period === option.id} aria-label={option.label}
            onChange={() => setPeriod(option.id)} />{option.short}
        </label>)}
      </fieldset>
    </div>
    <div className="o-chart-viewport" aria-busy={pending}>
      {history && (history.points.length ? <HistoryPlot history={history} metric={metric} fill={id.replace(/[^\w-]/g, "-") + "-fill"} active={active} onActive={setActive} />
        : <p className="o-chart-feedback">No completed market sales yet.</p>)}
      {pending && <p className="o-chart-feedback" role="status">Loading {selectedLabel.toLowerCase()}...</p>}
      {failed && <p className="o-chart-feedback" role="status">Could not load {selectedLabel.toLowerCase()}.
        {history ? " Showing " + displayedLabel!.toLowerCase() + "." : ""}{" "}
        <button type="button" className="o-text-button" onClick={() => setAttempt(value => value + 1)}>Retry</button></p>}
    </div>
  </section>;
}
