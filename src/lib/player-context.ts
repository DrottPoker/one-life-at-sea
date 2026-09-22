import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { withDatabaseRetry } from "@/lib/database-retry";

// Shared within one render only; permissions and balances are never TTL-cached.
export const playerContext = cache(async () => {
  const client = await createClient();
  const { data, error } = await client.rpc("get_player_context");
  if (error || !data) throw new Error("Your player context could not be loaded. Please sign in again.");
  return data;
});

export const playerSnapshot = cache(async () => {
  const client = await createClient();
  const { data, error } = await withDatabaseRetry(() => client.rpc("get_player_snapshot"));
  if (error || !data) throw new Error("Your resources could not be loaded. Please try again.");
  return data;
});
