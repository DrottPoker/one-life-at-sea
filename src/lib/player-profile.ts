import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { isPlayerNumber } from "@/lib/player-identity";
import { isUuid } from "@/lib/validation";

export const findPlayerProfile = cache(async (identifier: string) => {
  if (!isPlayerNumber(identifier) && !isUuid(identifier)) return null;
  const client = await createClient();
  const query = client.from("character_profiles")
    .select("character_id, player_number, display_name, location, created_at");
  const { data, error } = await (isPlayerNumber(identifier)
    ? query.eq("player_number", Number(identifier)) : query.eq("character_id", identifier)).maybeSingle();
  if (error) throw new Error("The player profile could not be loaded. Please try again.");
  return data;
});
