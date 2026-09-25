import { frontend } from "@/config/public";
import { GameLink as Link } from "@/components/game-navigation";
import { notFound } from "next/navigation";
import { Anchor } from "lucide-react";
import { Panel } from "@/components/shell";
import { ownSkillProgress } from "@/lib/skills-server";
import { ProfileSkills } from "@/components/profile-skills";
import { ProfileDetails } from "@/components/profile-details";
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
  const days = Math.max(0, Math.floor((Date.now() - created.getTime()) / 86_400_000));
  const age = days === 0 ? "Less than a day" : days === 1 ? "1 day" : days + " days";
  const backUrl = state.hospital_until ? "/harbor/hospital" : state.sea.state !== "in_harbor" ? "/sea" : "/harbor";
  const backLabel = state.hospital_until ? "Hospital" : state.sea.state !== "in_harbor" ? "At Sea" : "The Harbor";

  return <>
    <Panel title="Profile" detail={ownProfile ? "Your character" : "Captain"}>
      <div className="o-profile">
        <div className="o-profile-portrait" aria-hidden="true"><Anchor /><span>{frontend.site.name.toUpperCase()}</span></div>
        <div className="o-profile-info">
          <ProfileDetails key={profile.character_id} profile={profile} initialStatus={hospital} joined={joined} age={age} ownProfile={ownProfile} forum={forum} />
        </div>
      </div>
      {skills && <ProfileSkills progress={skills} />}
      {ownProfile && <DefenceOrders />}
      <div className="o-panel-foot"><Link href={backUrl}>Back to {backLabel}</Link></div>
    </Panel>
  </>;
}
