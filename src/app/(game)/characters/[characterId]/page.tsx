import { frontend } from "@/config/public";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Anchor, MapPin, Swords } from "lucide-react";
import { Panel } from "@/components/shell";
import { DefenceOrders } from "@/components/defence-orders";
import { requireCharacter } from "@/lib/player";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/combat";

export const metadata = { title: "Character profile" };

export default async function CharacterProfilePage({ params }: { params: Promise<{ characterId: string }> }) {
  const viewer = await requireCharacter();
  const { characterId } = await params;
  if (!isUuid(characterId)) notFound();
  const supabase = await createClient();
  const { data: profile, error } = await supabase.from("character_profiles")
    .select("character_id, display_name, location, created_at").eq("character_id", characterId).maybeSingle();
  if (error) throw new Error("The character profile could not be loaded.");
  if (!profile) notFound();

  const ownProfile = viewer.id === profile.character_id;
  const created = new Date(profile.created_at);
  const joined = new Intl.DateTimeFormat(frontend.site.locale, { day: "numeric", month: "long", year: "numeric", timeZone: frontend.site.logTimeZone }).format(created);
  const days = Math.max(0, Math.floor((Date.now() - created.getTime()) / 86_400_000));
  const age = days === 0 ? "Less than a day" : days === 1 ? "1 day" : days + " days";
  const location = profile.location === "the_harbor" ? "The Harbor" : "At sea";

  return <>
    <nav className="o-breadcrumb" aria-label="Breadcrumb"><Link href="/harbor">The Harbor</Link><span aria-hidden="true">/</span><span>Profile</span></nav>
    <Panel title="Profile" detail={ownProfile ? "Your character" : "Captain"}>
      <div className="o-profile">
        <div className="o-profile-portrait" aria-hidden="true"><Anchor /><span>{frontend.site.name.toUpperCase()}</span></div>
        <div className="o-profile-info">
          <header className="o-profile-identity"><h2>{profile.display_name}</h2><p>Captain</p></header>
          <dl className="o-profile-details">
            <div><dt>Location</dt><dd><MapPin aria-hidden="true" />{location}</dd></div>
            <div><dt>At sea since</dt><dd><time dateTime={profile.created_at}>{joined}</time></dd></div>
            <div><dt>Character age</dt><dd>{age}</dd></div>
          </dl>
          {!ownProfile && <div className="o-profile-actions">
            <Link className="o-training-button" href={"/attack/" + characterId} prefetch={false}><Swords size={14} aria-hidden="true" />Attack</Link>
          </div>}
        </div>
      </div>
      {ownProfile && <DefenceOrders />}
      <div className="o-panel-foot"><Link href="/harbor">Back to The Harbor</Link></div>
    </Panel>
  </>;
}
