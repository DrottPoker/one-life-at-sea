"use server";

import { gameplay, durationLabel } from "@/config/public";

import { revalidatePath } from "next/cache";
import { requireCharacter } from "@/lib/player";
import { createClient } from "@/lib/supabase/server";
import { withDatabaseRetry } from "@/lib/database-retry";
import { isStat, isTrainingGroup, STAT_LABELS, type TrainingResult } from "@/lib/game";

export async function trainStat(_previous: TrainingResult, form: FormData): Promise<TrainingResult> {
  await requireCharacter();
  const group = form.get("group");
  const stat = form.get("stat");
  if (!isTrainingGroup(group) || !isStat(stat)) return { error: true, message: "Choose a valid stat." };
  const supabase = await createClient();
  const { error } = await withDatabaseRetry(() => supabase.rpc("train_stat", { training_group: group, stat }));
  revalidatePath("/(game)", "layout");
  if (error) {
    return { error: true, message: error.message === "NOT_ENOUGH_ENERGY"
      ? `You need ${gameplay.training.energyCost} Energy. Recover 1 Energy every ${durationLabel(gameplay.resources.energyRecoverySeconds)}.`
      : error.message === "IN_COMBAT" ? "Finish your current fight before training."
      : "Your upgrade could not be saved. Please try again." };
  }
  return { message: (group === "crew" ? "Crew" : "Ship") + " " + STAT_LABELS[stat] + ` +${gameplay.training.statGain}. Spent ${gameplay.training.energyCost} Energy.` };
}
