import { gameplay } from "@/config/public";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export const HARBOR_PAGE_SIZE = gameplay.harbor.pageSize;
export type HarborPlayer = { character_id: string; display_name: string };
export type HarborRoster = { players: HarborPlayer[]; total: number; page: number; observed_at: string; next_arrival_at: string | null };

export async function loadHarborRoster(client: SupabaseClient<Database>, page: number, signal?: AbortSignal) {
  let query = client.rpc("list_harbor_players", { requested_page: page });
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error || !data) throw new Error("The harbor list could not be loaded.");
  return data;
}
