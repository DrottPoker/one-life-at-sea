import { frontend } from "@/config/public";

export const itemHistoryPeriods = [
  { id: "1m", label: "Last month", short: "1M" },
  { id: "3m", label: "Last 3 months", short: "3M" },
  { id: "6m", label: "Last 6 months", short: "6M" },
  { id: "1y", label: "Last year", short: "1Y" },
  { id: "3y", label: "Last 3 years", short: "3Y" },
  { id: "all", label: "All time", short: "All" },
] as const;
export type ItemHistoryPeriod = typeof itemHistoryPeriods[number]["id"];
export type ItemHistoryPoint = { at: string; total: string | null };
export type ItemHistory = {
  item_id: string; period: ItemHistoryPeriod; total: string | null; tracked_since: string | null;
  from: string; to: string; sampled: boolean; points: ItemHistoryPoint[];
};

const counts = new Intl.NumberFormat(frontend.site.locale);
const scientific = new Intl.NumberFormat(frontend.site.locale, { notation: "scientific", maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat(frontend.site.locale, { notation: "compact", maximumFractionDigits: 1 });
const dates = new Intl.DateTimeFormat(frontend.site.locale, {
  timeZone: "UTC", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
});
export const formatHistoryValue = (total: string | null) => total === null ? "N/A" : counts.format(BigInt(total));
export const itemHistoryDate = (at: string) => dates.format(new Date(at)) + " UTC";

export function nearestHistoryPoint(points: ItemHistoryPoint[], at: number) {
  let low = 0, high = points.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (Date.parse(points[middle].at) < at) low = middle + 1;
    else high = middle;
  }
  if (low > 0 && at - Date.parse(points[low - 1].at) <= Date.parse(points[low].at) - at) return low - 1;
  return low;
}

export function itemHistoryGeometry(history: ItemHistory, width: number) {
  const left = 62, right = Math.max(left + 1, width - 14), top = 14, bottom = 128, height = 180;
  const start = Date.parse(history.from), end = Math.max(start, Date.parse(history.to));
  const totals = history.points.filter(p => p.total !== null).map(p => BigInt(p.total!));
  if (!totals.length) totals.push(BigInt(0));
  const min = totals.reduce((a, b) => a < b ? a : b);
  const max = totals.reduce((a, b) => a > b ? a : b);
  const padding = (max - min) / BigInt(10) + BigInt(1);
  const floor = min > padding ? min - padding : BigInt(0), ceiling = max + padding;
  const span = ceiling - floor;
  const y = (total: bigint) => bottom - Number(total - floor) / Number(span) * (bottom - top);
  const x = (at: number) => left + (end > start ? (at - start) / (end - start) : 0) * (right - left);
  const points = history.points.map((point, index) => ({
    ...point, x: end === start && index === history.points.length - 1 ? right : x(Date.parse(point.at)), y: point.total === null ? bottom : y(BigInt(point.total)),
  }));
  let line = "", area = "", segment = "", segmentStart = 0, lastX = 0;
  for (const point of points) {
    if (point.total === null) {
      if (segment) {
        segment += " H " + point.x;
        line += segment;
        area += segment + " L " + point.x + " " + bottom + " L " + segmentStart + " " + bottom + " Z";
        segment = "";
      }
      continue;
    }
    if (!segment) { segmentStart = point.x; segment = "M " + point.x + " " + point.y; }
    else segment += " H " + point.x + " V " + point.y;
    lastX = point.x;
  }
  if (segment) {
    line += segment;
    area += segment + " L " + lastX + " " + bottom + " L " + segmentStart + " " + bottom + " Z";
  }
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
