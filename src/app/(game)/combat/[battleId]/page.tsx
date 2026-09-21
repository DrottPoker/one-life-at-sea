import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireCharacter } from "@/lib/player";
import { attackUrl } from "@/lib/combat";
import { isUuid } from "@/lib/validation";
import { withDatabaseRetry } from "@/lib/database-retry";
export default async function LegacyCombat({ params }: { params: Promise<{ battleId: string }> }) {
  await requireCharacter();
  const { battleId } = await params;
  if (!isUuid(battleId)) notFound();
  const client = await createClient();
  const { data, error } = await withDatabaseRetry(() => client.rpc("get_combat", { battle_id: battleId }));
  if (error) throw new Error("The encounter could not be loaded.");
  if (!data) notFound();
  redirect(data.status === "completed" ? "/combatlog/" + battleId : attackUrl(data.defender.player_number));
}
