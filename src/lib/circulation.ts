import { frontend } from "@/config/public";

export const circulationPeriods = [
  { id: "1m", label: "Last month" },
  { id: "3m", label: "Last 3 months" },
  { id: "6m", label: "Last 6 months" },
  { id: "1y", label: "Last year" },
  { id: "3y", label: "Last 3 years" },
  { id: "all", label: "All time" },
] as const;
export type CirculationPeriod = typeof circulationPeriods[number]["id"];
export type CirculationPoint = { at: string; total: string };
export type CirculationHistory = {
  item_id: string; period: CirculationPeriod; total: string; tracked_since: string;
  from: string; to: string; sampled: boolean; points: CirculationPoint[];
};

const counts = new Intl.NumberFormat(frontend.site.locale);
const scientific = new Intl.NumberFormat(frontend.site.locale, { notation: "scientific", maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat(frontend.site.locale, { notation: "compact", maximumFractionDigits: 1 });
const dates = new Intl.DateTimeFormat(frontend.site.locale, {
  timeZone: "UTC", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
});
export const formatCirculation = (total: string) => counts.format(BigInt(total));
export const circulationDate = (at: string) => dates.format(new Date(at)) + " UTC";

export function nearestCirculationPoint(points: CirculationPoint[], at: number) {
  let low = 0, high = points.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (Date.parse(points[middle].at) < at) low = middle + 1;
    else high = middle;
  }
  if (low > 0 && at - Date.parse(points[low - 1].at) <= Date.parse(points[low].at) - at) return low - 1;
  return low;
}

export function circulationGeometry(history: CirculationHistory, width: number) {
  const left = 62, right = Math.max(left + 1, width - 14), top = 14, bottom = 128, height = 180;
  const start = Date.parse(history.from), end = Math.max(start, Date.parse(history.to));
  const totals = history.points.map(p => BigInt(p.total));
  const min = totals.reduce((a, b) => a < b ? a : b);
  const max = totals.reduce((a, b) => a > b ? a : b);
  const padding = (max - min) / BigInt(10) + BigInt(1);
  const floor = min > padding ? min - padding : BigInt(0), ceiling = max + padding;
  const span = ceiling - floor;
  const y = (total: bigint) => bottom - Number(total - floor) / Number(span) * (bottom - top);
  const x = (at: number) => left + (end > start ? (at - start) / (end - start) : 0) * (right - left);
  const points = history.points.map((point, index) => ({
    ...point, x: end === start && index === history.points.length - 1 ? right : x(Date.parse(point.at)), y: y(BigInt(point.total)),
  }));
  const line = points.map((point, index) => index === 0
    ? "M " + point.x + " " + point.y
    : " H " + point.x + " V " + point.y).join("");
  const area = line + " L " + right + " " + bottom + " L " + left + " " + bottom + " Z";
  const levels = [...new Set(Array.from({ length: 5 }, (_, i) => floor + span * BigInt(i) / BigInt(4)))];
  const yTicks = levels.map(total => ({ y: y(total), label: (total >= BigInt("1000000000000000") ? scientific : compact).format(total) }));
  const timeTickCount = width < 480 ? 2 : 4;
  const dateFormat = new Intl.DateTimeFormat(frontend.site.locale, { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
  const timeFormat = new Intl.DateTimeFormat(frontend.site.locale, { timeZone: "UTC", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const xTicks = Array.from({ length: timeTickCount }, (_, i) => {
    const fraction = i / (timeTickCount - 1), date = new Date(start + (end - start) * fraction);
    return { x: left + (right - left) * fraction, date: dateFormat.format(date),
      time: end - start < 86400000 ? timeFormat.format(date) : "", anchor: i === 0 ? "start" : i === timeTickCount - 1 ? "end" : "middle" };
  });
  return { left, right, top, bottom, height, start, end, points, line, area, yTicks, xTicks };
}
