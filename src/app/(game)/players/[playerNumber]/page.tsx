import { frontend } from "@/config/public";
import { GameLink as Link } from "@/components/game-navigation";
import { notFound } from "next/navigation";
import { ownSkillProgress } from "@/lib/skills-server";
import { ProfileSkills } from "@/components/profile-skills";
import { ProfileOverview } from "@/components/profile-overview";
import { DefenceOrders } from "@/components/combat/defence-orders";
import { requireCharacter, gameStateForPlayer } from "@/lib/player";
import { createClient } from "@/lib/supabase/server";
import { isPlayerNumber } from "@/lib/player-identity";
import { findPlayerProfile } from "@/lib/player-profile";

export const metadata = { title: "Character profile" };

export default async function CharacterProfilePage({ params }: { params: Promise<{ playerNumber: string }> }) {
  const viewer = await requireCharacter({ allowHospital: true, allowSea: true });
  const state = await gameStateForPlayer();
  const { playerNumber } = await params;
  if (!isPlayerNumber(playerNumber)) notFound();
  const supabase = await createClient();
  const profile = await findPlayerProfile(playerNumber);
  if (!profile) notFound();

  const [{ data: hospital, error: hospitalError }, { data: forum, error: forumError }] = await Promise.all([
    supabase.rpc("get_character_status", { target_id: profile.character_id }),
    supabase.rpc("get_forum_author_stats", { player_number: profile.player_number }),
  ]);
  if (hospitalError || !hospital) throw new Error("The hospital status could not be loaded.");
  if (forumError || !forum) throw new Error("The forum profile could not be loaded.");
  const ownProfile = viewer.id === profile.character_id;
  const skills = ownProfile ? await ownSkillProgress() : null;
  const created = new Date(profile.created_at);
  const joined = new Intl.DateTimeFormat(frontend.site.locale, { day: "numeric", month: "long", year: "numeric", timeZone: frontend.site.logTimeZone }).format(created);
  const ageDays = Math.max(0, Math.floor((Date.now() - created.getTime()) / 86_400_000));
  const backUrl = state.hospital_until ? "/harbor/hospital" : state.sea.state !== "in_harbor" ? "/sea" : "/harbor";
  const backLabel = state.hospital_until ? "Hospital" : state.sea.state !== "in_harbor" ? "At Sea" : "The Harbor";

  return <div className="o-profile-page">
    <ProfileOverview key={profile.character_id} profile={profile} initialStatus={hospital} joined={joined} ageDays={ageDays} ownProfile={ownProfile} forum={forum}
      skills={skills && <ProfileSkills progress={skills} />} defence={ownProfile && <DefenceOrders />} />
    <p className="o-profile-back"><Link href={backUrl}>Back to {backLabel}</Link></p>
  </div>;
}
