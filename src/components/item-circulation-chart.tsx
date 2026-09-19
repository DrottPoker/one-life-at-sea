"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { createClient } from "@/lib/supabase/browser";
import { useGameState } from "@/components/game-state";
import { circulationDate, circulationGeometry, circulationPeriods, formatCirculation, nearestCirculationPoint,
  type CirculationHistory, type CirculationPeriod } from "@/lib/circulation";

function CirculationPlot({ history }: { history: CirculationHistory }) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [active, setActive] = useState<number | null>(null);
  useEffect(() => {
    const observer = new ResizeObserver(entries => setWidth(entries[0].contentRect.width));
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const graph = circulationGeometry(history, width);
  const index = Math.min(active ?? graph.points.length - 1, graph.points.length - 1);
  const selected = graph.points[index];

  function point(event: PointerEvent<HTMLDivElement>) {
    const position = event.clientX - event.currentTarget.getBoundingClientRect().left;
    const fraction = Math.max(0, Math.min(1, (position - graph.left) / (graph.right - graph.left)));
    setActive(nearestCirculationPoint(history.points, graph.start + fraction * (graph.end - graph.start)));
  }
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    let next = index;
    if (event.key === "ArrowLeft") next--;
    else if (event.key === "ArrowRight") next++;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = graph.points.length - 1;
    else return;
    event.preventDefault();
    setActive(Math.max(0, Math.min(graph.points.length - 1, next)));
  }

  return <div ref={container} className="o-circulation-plot" role="slider" tabIndex={0}
    aria-label="Circulation history timeline" aria-orientation="horizontal"
    aria-valuemin={0} aria-valuemax={graph.points.length - 1} aria-valuenow={index}
    aria-valuetext={circulationDate(selected.at) + ": " + formatCirculation(selected.total) + " items"}
    onPointerMove={point} onPointerDown={point} onPointerLeave={() => setActive(null)}
    onFocus={() => setActive(graph.points.length - 1)} onBlur={() => setActive(null)} onKeyDown={keyboard}>
    <svg viewBox={"0 0 " + width + " " + graph.height} width="100%" height={graph.height} aria-hidden="true">
      {graph.yTicks.map(tick => <g key={tick.y}>
        <line className="o-chart-grid" x1={graph.left} x2={graph.right} y1={tick.y} y2={tick.y} />
        <text className="o-chart-label" x={graph.left - 9} y={tick.y + 4} textAnchor="end">{tick.label}</text>
      </g>)}
      {graph.xTicks.map((tick, i) => <g key={i}>
        <line className="o-chart-grid" x1={tick.x} x2={tick.x} y1={graph.top} y2={graph.bottom} />
        <text className="o-chart-label" x={tick.x} y={graph.bottom + 20} textAnchor={tick.anchor as "start" | "middle" | "end"}>{tick.date}</text>
        {tick.time && <text className="o-chart-label" x={tick.x} y={graph.bottom + 36} textAnchor={tick.anchor as "start" | "middle" | "end"}>{tick.time}</text>}
      </g>)}
      <path className="o-chart-area" d={graph.area} />
      <path className="o-chart-line" d={graph.line} />
      {active !== null && <g>
        <line className="o-chart-cursor" x1={selected.x} x2={selected.x} y1={graph.top} y2={graph.bottom} />
        <circle className="o-chart-point" cx={selected.x} cy={selected.y} r={3.5} />
      </g>}
    </svg>
    {active !== null && <div className="o-chart-tooltip" role="tooltip"
      style={{ left: "clamp(0px, " + (selected.x - 110) + "px, max(0px, calc(100% - 220px)))", top: Math.max(0, selected.y - 65) }}>
      <span>{circulationDate(selected.at)}</span><strong>Total in circulation: {formatCirculation(selected.total)}</strong>
    </div>}
  </div>;
}

export function ItemCirculationChart({ itemId, name, circulation, id }: {
  itemId: string; name: string; circulation: string; id: string;
}) {
  const [period, setPeriod] = useState<CirculationPeriod>("all");
  const [attempt, setAttempt] = useState(0);
  const [response, setResponse] = useState<{ key: string; data: CirculationHistory | null; error: boolean } | null>(null);
  const { observed_at } = useGameState();
  const key = itemId + ":" + period + ":" + attempt;
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const { data, error } = await createClient().rpc("get_item_circulation", { target_item: itemId, period }).abortSignal(controller.signal);
        if (controller.signal.aborted) return;
        setResponse(previous => ({ key, data: data ?? (previous?.data?.item_id === itemId ? previous.data : null), error: !!error || !data }));
      } catch {
        if (!controller.signal.aborted) setResponse(previous => ({ key, data: previous?.data?.item_id === itemId ? previous.data : null, error: true }));
      }
    }
    void load();
    return () => controller.abort();
  }, [itemId, period, circulation, observed_at, attempt, key]);
  const history = response?.data?.item_id === itemId ? response.data : null;
  const pending = response?.key !== key;
  const failed = !pending && response?.error;
  const selectedLabel = circulationPeriods.find(option => option.id === period)!.label;
  const displayedLabel = circulationPeriods.find(option => option.id === history?.period)?.label;
  return <section className="o-circulation-chart" id={id} aria-label={name + " circulation history"}>
    <fieldset className="o-chart-periods">
      <legend className="sr-only">Circulation period</legend>
      {circulationPeriods.map(option => <label key={option.id}>
        <input type="radio" name={id + "-period"} value={option.id} checked={period === option.id}
          onChange={() => setPeriod(option.id)} />{option.label}
      </label>)}
    </fieldset>
    <div className="o-chart-viewport" aria-busy={pending}>
      {history && <CirculationPlot history={history} />}
      {pending && <p className="o-chart-feedback" role="status">Loading {selectedLabel.toLowerCase()}...</p>}
      {failed && <p className="o-chart-feedback" role="status">Could not load {selectedLabel.toLowerCase()}.
        {history ? " Showing " + displayedLabel!.toLowerCase() + "." : ""}{" "}
        <button type="button" className="o-text-button" onClick={() => setAttempt(value => value + 1)}>Retry</button></p>}
      {!pending && !failed && history?.sampled && <span className="o-chart-sampling">Sampled counts</span>}
    </div>
    {history && <p className="o-chart-caption">History since {circulationDate(history.tracked_since)}.
      {" "}Hover or tap to inspect; use arrow keys when focused.</p>}
  </section>;
}
