"use client";

import { useNavigationActivity } from "@/components/game-refresh";

import { gameplay } from "@/config/public";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Anchor, ChevronRight, Crosshair, Ship, Swords, Undo2 } from "lucide-react";
import { submitOrder } from "@/app/combat-actions";
import { CombatStage } from "@/components/combat/combat-stage";
import { CombatEvents, CombatPeople } from "@/components/combat/combat-log";
import { type Battle, type CombatOrder, ORDER_LABELS } from "@/lib/combat";

const orderDetails: Record<CombatOrder, string> = {
  fire: `${gameplay.combat.ammoPerShot} salvo${gameplay.combat.ammoPerShot === 1 ? "" : "s"}. Damage the opposing hull.`,
  board: "Give up your shot to attempt boarding.",
  crew_attack: "Attack the opposing crew.",
  disengage: "Take a counterattack, then return to sea.",
  retreat: "Take a counterattack, then leave the fight.",
};
const orderIcons = { fire: Crosshair, board: Anchor, crew_attack: Swords, disengage: Undo2, retreat: Ship };

export function CombatArena({ battle }: { battle: Battle }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  useNavigationActivity(pending);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<CombatOrder | null>(null);
  const inFlight = useRef(false);
  const request = useRef<{ round: number; order: CombatOrder; id: string } | null>(null);
  const active = battle.status === "active" && battle.participant_status === "active";
  const orders: CombatOrder[] = battle.phase === "sea" ? ["fire", "board", "retreat"] : ["crew_attack", "disengage", "retreat"];

  function giveOrder(order: CombatOrder) {
    if (inFlight.current || !active) return;
    inFlight.current = true;
    if (!request.current || request.current.round !== battle.round || request.current.order !== order) {
      request.current = { round: battle.round, order, id: crypto.randomUUID() };
    }
    const attempt = request.current;
    setSelected(order);
    setMessage("");
    startTransition(async () => {
      try {
        const result = await submitOrder(battle.id, attempt.round, attempt.order, attempt.id);
        if (result.message) setMessage(result.message);
      } catch {
        setMessage("Connection interrupted. Reload the fight to check the saved round, or retry the same order.");
      } finally { inFlight.current = false; }
    });
  }

  return <>
    <CombatStage attacker={battle.attacker} defender={battle.defender} phase={battle.phase} />
    {active ? <section className="o-combat-orders" aria-labelledby="orders-heading">
      <div className="o-section-bar"><h2 id="orders-heading"><Anchor aria-hidden="true" />Your next order</h2><span>Both sides act together</span></div>
      <div className="o-order-buttons">{orders.map(order => {
        const Icon = orderIcons[order];
        return <button key={order} data-tone={order === "retreat" ? "danger" : order === "fire" || order === "crew_attack" ? "primary" : "secondary"} onClick={() => giveOrder(order)} disabled={pending || (order === "fire" && (battle.attacker.ammo ?? 0) < gameplay.combat.ammoPerShot)}>
          <span className="o-order-icon" aria-hidden="true">{pending && selected === order ? <span className="o-spinner" /> : <Icon />}</span>
          <span className="o-order-copy"><strong>{ORDER_LABELS[order]}</strong><small>{orderDetails[order]}</small></span>
          <ChevronRight className="o-order-chevron" aria-hidden="true" />
        </button>;
      })}</div>
      <p className="o-combat-rule">All attackers share the opposing health. The final blow ends the encounter. Retreat is your way out; inactivity triggers an automatic retreat with a counterattack.</p>
    </section> : <section className="o-combat-result">
      <h2>{battle.participant_status === "retreated" ? "You withdrew" : battle.participant_status === "draw" ? "Round limit reached" : "Defeat"}</h2>
      <p>The other attackers are still fighting. The public combat log becomes available when the encounter ends.</p>
      <Link href="/harbor" className="o-training-button">Back to The Harbor</Link>
    </section>}
    <div className="o-combat-feedback" role="status">{message}{message && <button className="o-text-button" onClick={() => router.refresh()}>Reload fight</button>}</div>
    <div className="o-battle-record">
      <CombatEvents people={battle.people} events={battle.events} defenderId={battle.defender.id} defenderName={battle.defender.name} newestFirst />
      <CombatPeople people={battle.people} winnerId={battle.winner_id} />
    </div>
  </>;
}
