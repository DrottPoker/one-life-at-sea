"use client";

import { useNavigationActivity } from "@/components/game-refresh";

import { gameplay } from "@/config/public";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Anchor, Bomb, ChevronRight, Crosshair, Grape, Link2, Ship, Swords, Target, Undo2 } from "lucide-react";
import { submitOrder } from "@/app/combat-actions";
import { CombatStage } from "@/components/combat/combat-stage";
import { CombatEvents, CombatPeople } from "@/components/combat/combat-log";
import { type Battle, type CombatOrder, ORDER_LABELS } from "@/lib/combat";
import { fallbackWeapons, temporaryEffect } from "@/lib/equipment";

const salvos = `${gameplay.combat.ammoPerShot} salvo${gameplay.combat.ammoPerShot === 1 ? "" : "s"}`;
const orderIcons = { fire: Crosshair, fire_chain: Link2, fire_grape: Grape, board: Anchor, crew_shoot: Target, crew_throw: Bomb, crew_attack: Swords, disengage: Undo2, retreat: Ship };
const phaseOrders: Record<"sea" | "boarding", CombatOrder[]> = {
  sea: ["fire", "fire_chain", "fire_grape", "board", "retreat"],
  boarding: ["crew_shoot", "crew_throw", "crew_attack", "disengage", "retreat"],
};
const plural = (count: number, word: string) => count + " " + word + (count === 1 ? "" : "s");

// Every order stays visible; unavailable ones are disabled with the reason as their description.
function orderOptions(battle: Battle): Record<CombatOrder, { detail: string; available: boolean }> {
  const own = battle.attacker, loadout = own.loadout, ammo = (own.ammo ?? 0) >= gameplay.combat.ammoPerShot;
  const cannons = loadout?.cannons?.name ?? fallbackWeapons.cannons.name, stock = own.shot_stock ?? { chain: 0, grape: 0 };
  const firearm = loadout?.firearm, temporary = loadout?.temporary && "precision" in loadout.temporary ? loadout.temporary : null;
  const shots = own.shots ?? 0, uses = own.temporary_uses ?? 0;
  const special = (count: number) => !ammo ? "No salvos left." : count < 1 ? "None in your inventory." : plural(count, "shot") + " in stock.";
  return {
    fire: { detail: salvos + " with " + cannons + ". Damage the opposing hull.", available: ammo },
    fire_chain: { detail: special(stock.chain) + (stock.chain > 0 && ammo ? " Tears the rigging and slows the ship." : ""), available: ammo && stock.chain > 0 },
    fire_grape: { detail: special(stock.grape) + (stock.grape > 0 && ammo ? " Sweeps the enemy crew." : ""), available: ammo && stock.grape > 0 },
    board: { detail: "Give up your shot to attempt boarding.", available: true },
    crew_shoot: { detail: firearm ? firearm.name + ". " + plural(shots, "shot") + " left." : "No firearm equipped.", available: !!firearm && shots > 0 },
    crew_throw: { detail: !temporary ? "No temporary equipped." : temporary.name + ". " + (uses > 0 ? temporaryEffect(temporary) + "." : "Used up for this fight."),
      available: !!temporary && uses > 0 },
    crew_attack: { detail: (loadout?.melee?.name ?? fallbackWeapons.melee.name) + ". Attack the opposing crew.", available: true },
    disengage: { detail: "Take a counterattack, then return to sea.", available: true },
    retreat: { detail: "Take a counterattack, then leave the fight.", available: true },
  };
}

export function CombatArena({ battle }: { battle: Battle }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  useNavigationActivity(pending);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<CombatOrder | null>(null);
  const inFlight = useRef(false);
  const request = useRef<{ round: number; order: CombatOrder; id: string } | null>(null);
  const active = battle.status === "active" && battle.participant_status === "active";
  const orders = phaseOrders[battle.phase], options = orderOptions(battle);

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
        return <button key={order} data-tone={order === "retreat" ? "danger" : order === "board" || order === "disengage" ? "secondary" : "primary"} onClick={() => giveOrder(order)}
          disabled={pending || !options[order].available}>
          <span className="o-order-icon" aria-hidden="true">{pending && selected === order ? <span className="o-spinner" /> : <Icon />}</span>
          <span className="o-order-copy"><strong>{ORDER_LABELS[order]}</strong><small>{options[order].detail}</small></span>
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
