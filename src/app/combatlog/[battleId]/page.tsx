import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation";
import { CombatEvents, CombatPeople, outcomeLabel } from "@/components/combat-log";
import { ShareCombatLog } from "@/components/share-combat-log";

export const metadata = { title: "Combat log" };

export default async function CombatLogPage({ params }: { params: Promise<{ battleId: string }> }) {
  const { battleId } = await params;
  if (!isUuid(battleId)) notFound();
  const client = await createClient();
  const { data, error } = await client.rpc("get_combat_log", { battle_id: battleId });
  if (error) throw new Error("The combat log could not be loaded.");
  if (!data) notFound();
  const winner = data.people.find(person => person.id === data.winner_id);
  return <main id="main" className="o-public-log">
    <header className="o-attack-heading"><div><span className="o-attack-brand">PUBLIC ENCOUNTER RECORD</span><h1>Combat log</h1></div><Link href="/harbor">Back to The Harbor</Link></header>
    <section className="o-combat-result">
      <h2>{outcomeLabel(data.outcome)}</h2>
      {winner && <p><strong><Link href={winner.player_number ? "/players/" + winner.player_number : "/characters/" + winner.id}>{winner.name}</Link></strong>{winner.role === "attacker" ? " landed the final blow." : " defended successfully."}</p>}
      <p className="o-copy">All captains, ships and crews survive PvP. Health recovers after each captain leaves combat.</p>
      <ShareCombatLog />
    </section>
    <div className="o-battle-record"><CombatEvents people={data.people} events={data.events} defenderId={data.defender_id} defenderName={data.defender_name} /><CombatPeople people={data.people} winnerId={data.winner_id} /></div>
  </main>;
}
