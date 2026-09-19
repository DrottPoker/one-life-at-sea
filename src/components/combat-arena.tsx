"use client";

import { gameplay, frontend } from "@/config/public";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Anchor, Crosshair, Flag, Swords, Undo2 } from "lucide-react";
import { submitOrder } from "@/app/combat-actions";
import { CombatantPanel } from "@/components/combatant-panel";
import { CombatEvents, CombatPeople } from "@/components/combat-log";
import { MAX_ROUNDS, type Battle, type CombatOrder, ORDER_LABELS } from "@/lib/combat";

const orderDetails: Record<CombatOrder, string> = {
  fire: `${gameplay.combat.ammoPerShot} salvo${gameplay.combat.ammoPerShot === 1 ? "" : "s"}. Damage the opposing hull.`,
  board: "Give up your shot to attempt boarding.",
  crew_attack: "Attack the opposing crew.",
  disengage: "Take a counterattack, then return to sea.",
  retreat: "Take a counterattack, then leave the fight.",
};
const orderIcons = { fire: Crosshair, board: Anchor, crew_attack: Swords, disengage: Undo2, retreat: Flag };

function FightClock({ deadline, observedAt }: { deadline: string; observedAt: string }) {
  const duration = Math.max(0, Date.parse(deadline) - Date.parse(observedAt));
  const [remaining, setRemaining] = useState(Math.ceil(duration / 1000));
  useEffect(() => {
    const started = performance.now();
    const timer = setInterval(() => setRemaining(Math.max(0, Math.ceil((duration - (performance.now() - started)) / 1000))), frontend.refresh.countdownTickMs);
    return () => clearInterval(timer);
  }, [duration]);
  return <span className="o-fight-clock">Next order within <strong>{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</strong></span>;
}

export function CombatArena({ battle }: { battle: Battle }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
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
    <div className="o-combat-status">
      <strong>{active ? battle.phase === "sea" ? "Cannon combat" : "Boarding" : "You have left this encounter"}</strong>
      <span>Round {battle.round} / {MAX_ROUNDS}</span>
      {active && <FightClock deadline={battle.deadline} observedAt={battle.observed_at} key={battle.observed_at} />}
    </div>
    <div className="o-combat-grid">
      <CombatantPanel captain={battle.attacker} own phase={battle.phase} />
      <CombatantPanel captain={battle.defender} own={false} phase={battle.phase} />
    </div>
    {active ? <section className="o-combat-orders" aria-labelledby="orders-heading">
      <div className="o-section-bar"><h2 id="orders-heading">Your next order</h2><span>Both sides act together</span></div>
      <div className="o-order-buttons">{orders.map(order => {
        const Icon = orderIcons[order];
        return <button key={order} onClick={() => giveOrder(order)} disabled={pending || (order === "fire" && (battle.attacker.ammo ?? 0) < gameplay.combat.ammoPerShot)}>
          <span>{pending && selected === order ? <span className="o-spinner" aria-hidden="true" /> : <Icon aria-hidden="true" />}<strong>{ORDER_LABELS[order]}</strong></span>
          <small>{orderDetails[order]}</small>
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
      <CombatEvents events={battle.events} defenderId={battle.defender.id} defenderName={battle.defender.name} newestFirst />
      <CombatPeople people={battle.people} winnerId={battle.winner_id} />
    </div>
  </>;
}
