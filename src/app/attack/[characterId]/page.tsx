import { notFound, redirect, permanentRedirect } from "next/navigation";
import { requireCharacter, gameStateForPlayer } from "@/lib/player";
import { createClient } from "@/lib/supabase/server";
import { withDatabaseRetry } from "@/lib/database-retry";
import { attackUrl, type Battle, type CombatPreview } from "@/lib/combat";
import { findPlayerProfile } from "@/lib/player-profile";
import { AttackSession } from "@/components/combat/attack-session";
import { ownSkillProgress } from "@/lib/skills-server";
import { XpDrop } from "@/components/xp-drop";
import { GameStateProvider } from "@/components/game-state";

export const metadata = { title: "Attacking" };

export default async function AttackPage({ params }: { params: Promise<{ characterId: string }> }) {
  const { characterId: identifier } = await params;
  const character = await requireCharacter({ allowSea: true, allowHospital: true });
  const [state, skills] = await Promise.all([gameStateForPlayer(), ownSkillProgress()]);
  const profile = await findPlayerProfile(identifier);
  if (!profile) notFound();
  const characterId = profile.character_id;
  if (state.active_attack && characterId !== state.active_attack.target_id) {
    redirect(attackUrl(state.active_attack.target_player_number));
  }
  if (identifier !== String(profile.player_number)) permanentRedirect(attackUrl(profile.player_number));
  const backUrl = state.sea.state === "in_harbor" ? "/harbor" : "/sea";
  const backLabel = state.sea.state === "in_harbor" ? "The Harbor" : "At Sea";
  if (characterId === character.id) redirect(backUrl);
  const client = await createClient();
  let battle: Battle | null = null;
  const battleId = state.active_attack?.battle_id ?? state.last_combat_id;
  if (battleId) {
    const { data, error } = await withDatabaseRetry(() => client.rpc("get_combat", { battle_id: battleId }));
    if (error) throw new Error("The fight could not be loaded.");
    if (data?.defender.id === characterId) battle = data;
  }
  // A defeated attacker is already in hospital. Only the finished fight with this target may render here: the tab that
  // watched it keeps its result until Leave, and any other visit is sent on to hospital by the client.
  const hospital = !!state.hospital_until;
  if (hospital && battle?.status !== "completed") redirect("/harbor/hospital");
  let preview: CombatPreview | null = null;
  if (battle?.status !== "active" && !hospital) {
    const { data, error } = await withDatabaseRetry(() => client.rpc("get_combat_preview", { target_id: characterId }));
    if (error) throw new Error("This encounter could not be loaded.");
    if (!data || "error" in data) notFound();
    preview = data;
  }
  return <GameStateProvider state={state}><main id="main" className="o-attack-main">
    <AttackSession battle={battle} preview={preview} key={characterId} hospital={hospital}
      heading={{ energy: state.energy, backUrl, backLabel, canLeave: !state.active_attack && !hospital }} />
  </main><XpDrop skills={skills} /></GameStateProvider>;
}
