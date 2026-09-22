export const economyPeriods = [{ id: "24h", label: "24 hours" }, { id: "7d", label: "7 days" }, { id: "30d", label: "30 days" }, { id: "all", label: "All history" }] as const;
export type EconomyPeriod = typeof economyPeriods[number]["id"];
export type EconomySort = "value" | "quantity" | "name" | "unpriced";
export type EconomyRanking = "coins" | "items" | "total";
export type EconomyPlayer = {
  id: string; name: string; player_number: number; gold: string; bank: string; coins: string;
  inventory_value: string; listed_value: string; item_value: string; total_value: string; unpriced_units: string;
};
export type EconomyItem = {
  id: string; name: string; image_path: string; active: boolean; inventory: string; listed: string;
  units: string; unit_value: string | null; total_value: string | null; last_sale: string | null;
};
export type EconomyObservation = { at: string; coins: string; item_units: string; item_value: string; unpriced_units: string };
export type EconomyDashboard = {
  observed_at: string; period: EconomyPeriod; tracked_since: string | null; last_snapshot: string | null; sampled: boolean;
  totals: { gold: string; bank: string; coins: string; players: string; item_units: string; item_value: string;
    listed_units: string; unpriced_units: string; unpriced_types: string; top_ten_coins: string };
  market_24h: { trades: string; volume: string; fees: string; units: string };
  rankings: Partial<Record<EconomyRanking, EconomyPlayer[]>> | null;
  items: { total: string; page: number; page_size: number; rows: EconomyItem[] };
  history: EconomyObservation[];
  market_days: { at: string; volume: string; fees: string }[];
};
export const economyNumber = (value: string | bigint | null) => value === null ? "Unpriced" : BigInt(value).toLocaleString("en-GB");
export function economyShare(part: string, total: string) {
  const denominator = BigInt(total);
  return denominator > BigInt(0) ? Number(BigInt(part) * BigInt(10000) / denominator) / 100 : 0;
}
export const economyDate = (value: string) => new Date(value).toLocaleString("en-GB", { timeZone: "UTC" }) + " UTC";
