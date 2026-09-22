import { assertGameplayRevision } from "@/config/revision";
import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseConfig } from "@/lib/env";
import { playerContext, playerSnapshot } from "@/lib/player-context";

export const currentUser = cache(async () => {
  if (!getSupabaseConfig()) return null;
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user || user.is_anonymous) return null;
  return user;
});

export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

export const characterForUser = cache(async (userId: string) => {
  const { character } = await playerContext();
  return character?.user_id === userId ? character : null;
});

export async function requireCharacter({ allowHospital = false, allowSea = false }: { allowHospital?: boolean; allowSea?: boolean } = {}) {
  const user = await requireUser();
  const [, character] = await Promise.all([assertGameplayRevision(), characterForUser(user.id)]);
  if (!character) redirect("/create-character");
  if (!allowHospital || !allowSea) {
    const state = await gameStateForPlayer();
    if (!allowHospital && state.hospital_until) redirect("/harbor/hospital");
    if (!allowSea && state.sea.state !== "in_harbor") redirect("/sea");
  }
  return character;
}

export const gameStateForPlayer = cache(async () => {
  await Promise.all([requireUser(), assertGameplayRevision()]);
  return (await playerSnapshot()).state;
});
