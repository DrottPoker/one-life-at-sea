import Link from "next/link";
import { Store, Hammer, Swords, Ship } from "lucide-react";
import { requireCharacter } from "@/lib/player";
import { Panel, HarborArt } from "@/components/shell";

import { HarborPlayers } from "@/components/harbor-players";
import { createClient } from "@/lib/supabase/server";
import { loadHarborRoster } from "@/lib/harbor";

export const metadata = { title: "The Harbor" };

export default async function Harbor() {
  const character = await requireCharacter();
  const client = await createClient();
  const roster = await loadHarborRoster(client, 0).catch(() => null);
  return <>
    <nav className="o-breadcrumb" aria-label="Breadcrumb"><span>The Harbor</span><span aria-hidden="true">/</span><span>Overview</span></nav>
    <Panel title="The Harbor" detail="A sheltered anchorage"><HarborArt priority /><div className="o-arrival">
      <h2>Welcome ashore, {character.display_name}.</h2><p className="o-copy">Salt in the air. Sunlight on the water. Beyond the palms, the open sea waits.</p>
    </div></Panel>
    <HarborPlayers initial={roster} characterId={character.id} />
    <section className="o-panel" aria-label="Harbor directory"><header className="o-panel-title"><h2>Around the harbor</h2></header>
      <div className="o-directory-head" aria-hidden="true"><span>Location</span><span>Status</span></div>
      <Link href="/harbor/crew-training" className="o-directory-row"><Swords aria-hidden="true" /><span><strong>Crew Training</strong><small>Train the crew that sails with you.</small></span><span className="o-directory-status">5 Energy / +1</span></Link>
      <Link href="/harbor/ship-upgrades" className="o-directory-row"><Ship aria-hidden="true" /><span><strong>Ship Upgrades</strong><small>Improve your ship&apos;s four stats.</small></span><span className="o-directory-status">5 Energy / +1</span></Link>
      <Link href="/harbor/marketplace" className="o-directory-row"><Store aria-hidden="true" /><span><strong>Marketplace</strong><small>Trade along the waterfront.</small></span><span className="o-directory-status">Coming later</span></Link>
      <Link href="/harbor/shipyard" className="o-directory-row"><Hammer aria-hidden="true" /><span><strong>Shipyard</strong><small>The shipwright&apos;s workshop.</small></span><span className="o-directory-status">Coming later</span></Link>
    </section>
  </>;
}
