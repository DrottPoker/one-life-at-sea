import type { ItemHistory } from "@/lib/item-history";

export { itemHistoryPeriods as circulationPeriods, formatHistoryValue as formatCirculation,
  itemHistoryDate as circulationDate, nearestHistoryPoint as nearestCirculationPoint,
  itemHistoryGeometry as circulationGeometry } from "@/lib/item-history";
export type { ItemHistoryPeriod as CirculationPeriod } from "@/lib/item-history";
export type CirculationPoint = { at: string; total: string };
export type CirculationHistory = Omit<ItemHistory, "total" | "tracked_since" | "points"> & {
  total: string; tracked_since: string; points: CirculationPoint[];
};
