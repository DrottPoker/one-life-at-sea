export const playerPeriods = [{ id: "1m", label: "Last month" }, { id: "12m", label: "12 months" }, { id: "all", label: "All time" }] as const;
export type PlayerPeriod = typeof playerPeriods[number]["id"];
export const playerSorts = ["newest", "oldest", "last_active", "name"] as const;
export type PlayerSort = typeof playerSorts[number];
export const playerActivityFilters = ["all", "24h", "7d", "30d", "inactive", "never"] as const;
export type PlayerActivityFilter = typeof playerActivityFilters[number];
export type PlayerStatistics = {
  observed_at: string; period: PlayerPeriod; tracked_since: string; bucket_days: number;
  totals: { players: string; accounts: string; without_character: string;
    active_24h: string; active_7d: string; active_1m: string; new_24h: string; new_7d: string; new_1m: string };
  period_totals: { new_accounts: string; removed_accounts: string; net_growth: string; unique_active: string };
  history: { at: string; until: string; registrations: string; removals: string; accounts: string; unique_players: string | null }[];
};
export type AdminPlayerList = {
  total: string; page: number; page_size: number;
  rows: { id: string; display_name: string; player_number: number; registered_at: string; last_active_at: string | null;
    gold_coins: string; bank_gold_coins: string; energy: number; stamina: number; ship_health: number; crew_health: number; hospital_until: string | null }[];
};
