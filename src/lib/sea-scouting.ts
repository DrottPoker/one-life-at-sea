export type ScoutReceipt = { id: string; sea_distance: number; scouted_at: string; total: number; energy_cost: number };
export type ScoutPage = Omit<ScoutReceipt, "energy_cost"> & {
  page: number; players: { character_id: string; player_number: number; display_name: string; position: number }[];
};
export type ScoutActionResult = { message?: string; error?: boolean; retry?: boolean };
