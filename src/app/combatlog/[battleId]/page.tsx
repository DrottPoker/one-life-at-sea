import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ScrollText } from "lucide-react";
import { frontend } from "@/config/public";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation";
import { formatCountdown } from "@/lib/time";
import { SCENE_ART } from "@/lib/combat-scene-anchors";
import { CombatEvents, CombatMatchup, outcomeLabel } from "@/components/combat/combat-log";
import { ShareCombatLog } from "@/components/combat/share-combat-log";

export const metadata = { title: "Combat log" };

const fought = new Intl.DateTimeFormat(frontend.site.locale, {
  timeZone: frontend.site.logTimeZone, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
});

export default async function CombatLogPage({ params }: { params: Promise<{ battleId: string }> }) {
  const { battleId } = await params;
  if (!isUuid(battleId)) notFound();
  const client = await createClient();
  const { data, error } = await client.rpc("get_combat_log", { battle_id: battleId });
  if (error) throw new Error("The combat log could not be loaded.");
  if (!data) notFound();
  const winner = data.people.find(person => person.id === data.winner_id);
  // The banner shows the artwork of the phase the encounter was decided in.
  const lastRound = data.events.findLast(event => event.kind === "round");
  const phase = data.outcome === "boarding_victory" ? "boarding" : data.outcome === "hull_victory" ? "sea" : lastRound?.phase ?? "sea";
  const lasted = data.finished_at ? Math.max(0, Math.round((Date.parse(data.finished_at) - Date.parse(data.started_at)) / 1000)) : null;
  return <main id="main" className="o-public-log">
    <header className="o-log-hero" data-phase={phase}>
      <Image className="o-log-hero-art" src={SCENE_ART[phase]} alt="" fill sizes="(max-width: 800px) 100vw, 1200px" preload />
      <div className="o-log-hero-bar"><Link href="/harbor">Back to The Harbor</Link></div>
      <div className="o-log-hero-copy">
        <p className="o-log-hero-eyebrow"><ScrollText aria-hidden="true" />Public combat log</p>
        <h1>{outcomeLabel(data.outcome)}</h1>
        {winner && <p className="o-log-hero-lead"><strong><Link href={winner.player_number ? "/players/" + winner.player_number : "/characters/" + winner.id}>{winner.name}</Link></strong>
          {winner.role === "attacker" ? " landed the final blow." : " defended successfully."}</p>}
        <div className="o-log-hero-foot">
          <dl><div><dt>Fought</dt><dd>{fought.format(new Date(data.started_at))} {frontend.site.logTimeZone}</dd></div>
            {lasted !== null && <div><dt>Lasted</dt><dd>{formatCountdown(lasted)}</dd></div>}</dl>
          <ShareCombatLog />
        </div>
      </div>
    </header>
    <CombatMatchup people={data.people} winnerId={data.winner_id} />
    <CombatEvents people={data.people} events={data.events} defenderId={data.defender_id} defenderName={data.defender_name} />
    <p className="o-log-footnote">All captains, ships and crews survive PvP. Health recovers after each captain leaves combat.</p>
  </main>;
}
