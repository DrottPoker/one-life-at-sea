"use server";

import { revalidatePath } from "next/cache";
import { requireCharacter } from "@/lib/player";
import { createClient } from "@/lib/supabase/server";
import { withDatabaseRetry } from "@/lib/database-retry";
import { combatError, MAX_ROUNDS, isCombatOrder, isUuid, type CombatActionResult } from "@/lib/combat";

export async function startFight(targetId: string, requestId: string): Promise<CombatActionResult> {
  await requireCharacter();
  if (!isUuid(targetId) || !isUuid(requestId)) return { message: "Choose a valid captain." };
  const client = await createClient();
  const { data, error } = await withDatabaseRetry(() => client.rpc("start_combat", { target_id: targetId, request_id: requestId }));
  revalidatePath("/", "layout");
  if (error || !data) return { message: combatError(error?.message ?? "") };
  if ("error" in data) return { message: combatError(data.error) };
  return { battleId: data.battle.id };
}

export async function submitOrder(battleId: string, round: number, order: string, requestId: string): Promise<CombatActionResult> {
  await requireCharacter();
  if (!isUuid(battleId) || !isUuid(requestId) || !isCombatOrder(order) || !Number.isInteger(round) || round < 0 || round >= MAX_ROUNDS) {
    return { message: "Choose a valid order." };
  }
  const client = await createClient();
  const { data, error } = await withDatabaseRetry(() => client.rpc("submit_combat_order", {
    battle_id: battleId, expected_round: round, player_order: order, request_id: requestId,
  }));
  revalidatePath("/", "layout");
  if (error || !data) return { message: combatError(error?.message ?? "") };
  if ("error" in data) return { message: combatError(data.error) };
  return { battleId: data.battle.id };
}

export async function saveDefence(_previous: { message?: string }, form: FormData): Promise<{ message?: string }> {
  await requireCharacter();
  const preset = form.get("preset");
  if (preset !== "cannon" && preset !== "boarding") return { message: "Choose a defence order." };
  const client = await createClient();
  const { error } = await withDatabaseRetry(() => client.rpc("save_defence_orders", { preset }));
  revalidatePath("/", "layout");
  return { message: error ? "Your defence orders could not be saved." : "Defence orders saved. Changes apply to your next fight." };
}
