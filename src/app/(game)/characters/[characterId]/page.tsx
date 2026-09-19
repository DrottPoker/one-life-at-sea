import { frontend } from "@/config/public";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Anchor } from "lucide-react";
import { Panel } from "@/components/shell";
import { ProfileDetails } from "@/components/profile-details";
import { DefenceOrders } from "@/components/defence-orders";
import { requireCharacter, gameStateForPlayer } from "@/lib/player";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation";

export const metadata = { title: "Character profile" };

export default async function CharacterProfilePage({ params }: { params: Promise<{ characterId: string }> }) {
  const viewer = await requireCharacter({ allowHospital: true });
  const state = await gameStateForPlayer();
  const { characterId } = await params;
  if (!isUuid(characterId)) notFound();
  const supabase = await createClient();
  const { data: profile, error } = await supabase.from("character_profiles")
    .select("character_id, display_name, location, created_at").eq("character_id", characterId).maybeSingle();
  if (error) throw new Error("The character profile could not be loaded.");
  if (!profile) notFound();

  const { data: hospital, error: hospitalError } = await supabase.rpc("get_hospital_status", { target_id: characterId });
  if (hospitalError || !hospital) throw new Error("The hospital status could not be loaded.");
  const ownProfile = viewer.id === profile.character_id;
  const created = new Date(profile.created_at);
  const joined = new Intl.DateTimeFormat(frontend.site.locale, { day: "numeric", month: "long", year: "numeric", timeZone: frontend.site.logTimeZone }).format(created);
  const days = Math.max(0, Math.floor((Date.now() - created.getTime()) / 86_400_000));
  const age = days === 0 ? "Less than a day" : days === 1 ? "1 day" : days + " days";
  const backUrl = state.hospital_until ? "/harbor/hospital" : "/harbor";
  const backLabel = state.hospital_until ? "Hospital" : "The Harbor";

  return <>
    <nav className="o-breadcrumb" aria-label="Breadcrumb"><Link href={backUrl}>{backLabel}</Link><span aria-hidden="true">/</span><span>Profile</span></nav>
    <Panel title="Profile" detail={ownProfile ? "Your character" : "Captain"}>
      <div className="o-profile">
        <div className="o-profile-portrait" aria-hidden="true"><Anchor /><span>{frontend.site.name.toUpperCase()}</span></div>
        <div className="o-profile-info">
          <header className="o-profile-identity"><h2>{profile.display_name}</h2><p>Captain</p></header>
          <ProfileDetails key={profile.character_id} profile={profile} initialHospital={hospital} joined={joined} age={age} ownProfile={ownProfile} />
        </div>
      </div>
      {ownProfile && <DefenceOrders />}
      <div className="o-panel-foot"><Link href={backUrl}>Back to {backLabel}</Link></div>
    </Panel>
  </>;
}
