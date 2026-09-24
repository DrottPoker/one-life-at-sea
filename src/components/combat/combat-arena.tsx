"use client";

import { useNavigationActivity } from "@/components/game-refresh";

import { gameplay } from "@/config/public";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Anchor, Bomb, ChevronRight, Crosshair, Grape, Link2, Ship, Swords, Target, Undo2 } from "lucide-react";
import { submitOrder } from "@/app/combat-actions";
import { CombatStage } from "@/components/combat/combat-stage";
import { CombatEvents, CombatPeople, outcomeLabel } from "@/components/combat/combat-log";
import { type Battle, type CombatOrder, ORDER_LABELS } from "@/lib/combat";
import { fallbackWeapons, SHOT_NAMES, temporaryEffect, type ShotKind } from "@/lib/equipment";

const salvos = `${gameplay.combat.ammoPerShot} salvo${gameplay.combat.ammoPerShot === 1 ? "" : "s"}`;
type Ammo = "round" | ShotKind;
type OrderButton = "fire" | Exclude<CombatOrder, "fire" | "fire_chain" | "fire_grape">;
const orderIcons = { fire: Crosshair, board: Anchor, crew_shoot: Target, crew_throw: Bomb, crew_attack: Swords, disengage: Undo2, retreat: Ship };
const phaseOrders: Record<"sea" | "boarding", OrderButton[]> = {
  sea: ["fire", "board", "retreat"],
  boarding: ["crew_shoot", "crew_throw", "crew_attack", "disengage", "retreat"],
};
const maneuvers: OrderButton[] = ["board", "disengage", "retreat"];
const ammoOptions: { kind: Ammo; name: string; Icon: typeof Crosshair; effect: string }[] = [
  { kind: "round", name: "Round shot", Icon: Crosshair, effect: "Damage the opposing hull." },
  { kind: "chain", name: SHOT_NAMES.chain, Icon: Link2, effect: "Tears the rigging and slows the ship." },
  { kind: "grape", name: SHOT_NAMES.grape, Icon: Grape, effect: "Wounds the enemy crew." },
];
const plural = (count: number, word: string) => count + " " + word + (count === 1 ? "" : "s");
const finishedTitles: Partial<Record<Battle["participant_status"], string>> = { victory: "Victory", assist: "Victory", defeated: "Defeat", retreated: "You withdrew", draw: "Draw" };

// Every order stays visible; unavailable ones are disabled with the reason as their description.
function orderOptions(battle: Battle, ammo: Ammo): Record<OrderButton, { detail: string; available: boolean }> {
  const own = battle.attacker, loadout = own.loadout, salvo = (own.ammo ?? 0) >= gameplay.combat.ammoPerShot;
  const cannons = loadout?.cannons?.name ?? fallbackWeapons.cannons.name, shot = ammoOptions.find(option => option.kind === ammo)!;
  const firearm = loadout?.firearm, temporary = loadout?.temporary && "precision" in loadout.temporary ? loadout.temporary : null;
  const shots = own.shots ?? 0, uses = own.temporary_uses ?? 0;
  return {
    fire: { detail: !salvo ? "No salvos left." : salvos + (ammo === "round" ? "" : " of " + shot.name) + " with " + cannons + ". " + shot.effect, available: salvo },
    board: { detail: "Give up your shot to attempt boarding.", available: true },
    crew_shoot: { detail: firearm ? firearm.name + ". " + plural(shots, "shot") + " left." : "No firearm equipped.", available: !!firearm && shots > 0 },
    crew_throw: { detail: !temporary ? "No temporary equipped." : temporary.name + ". " + (uses > 0 ? temporaryEffect(temporary) + "."
      : (temporary.quantity ?? 0) < 1 ? "None in your inventory." : "Used up for this fight."), available: !!temporary && uses > 0 },
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
  const [ammoChoice, setAmmoChoice] = useState<Ammo>("round");
  const active = battle.status === "active" && battle.participant_status === "active";
  const stock = battle.attacker.shot_stock ?? { chain: 0, grape: 0 };
  // A special shot that runs out falls back to round shot instead of leaving Fire unusable.
  const ammo: Ammo = ammoChoice !== "round" && stock[ammoChoice] < 1 ? "round" : ammoChoice;
  const orders = phaseOrders[battle.phase], options = orderOptions(battle, ammo);
  const orderFor = (button: OrderButton): CombatOrder => button === "fire" && ammo !== "round" ? ammo === "chain" ? "fire_chain" : "fire_grape" : button;

  function giveOrder(order: CombatOrder) {
    if (inFlight.current || !active) return;
    inFlight.current = true;
    if (!request.current || request.current.round !== battle.round || request.current.order !== order) {
      request.current = { round: battle.round, order, id: crypto.randomUUID() };
    }
    const attempt = request.current;
    setSelected(order.startsWith("fire") ? "fire" : order);
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
    <CombatStage attacker={battle.attacker} defender={battle.defender} phase={battle.phase} events={battle.events} />
    {active ? <section className="o-combat-orders" aria-labelledby="orders-heading">
      <div className="o-section-bar"><h2 id="orders-heading"><Anchor aria-hidden="true" />Your next order</h2><span>Both sides act together</span></div>
      {battle.phase === "sea" && <fieldset className="o-ammo-select" disabled={pending}>
        <legend>Cannon ammunition</legend>
        {ammoOptions.map(({ kind, name, Icon, effect }) => {
          const count = kind === "round" ? null : stock[kind];
          return <label key={kind} data-selected={ammo === kind} title={effect}>
            <input type="radio" name="cannon-ammo" value={kind} checked={ammo === kind} disabled={count !== null && count < 1} onChange={() => setAmmoChoice(kind)} />
            <Icon aria-hidden="true" />
            <span><strong>{name}</strong><small>{count === null ? "No stock needed" : count < 1 ? "None in inventory" : plural(count, "shot") + " in inventory"}</small></span>
          </label>;
        })}
      </fieldset>}
      <div className="o-order-buttons" data-phase={battle.phase}>{orders.map(order => {
        const Icon = order === "fire" ? ammoOptions.find(option => option.kind === ammo)!.Icon : orderIcons[order];
        return <button key={order} data-group={maneuvers.includes(order) ? "maneuver" : "attack"}
          data-tone={order === "retreat" ? "danger" : maneuvers.includes(order) ? "secondary" : "primary"} onClick={() => giveOrder(orderFor(order))}
          disabled={pending || !options[order].available}>
          <span className="o-order-icon" aria-hidden="true">{pending && selected === order ? <span className="o-spinner" /> : <Icon />}</span>
          <span className="o-order-copy"><strong>{ORDER_LABELS[order]}</strong><small>{options[order].detail}</small></span>
          <ChevronRight className="o-order-chevron" aria-hidden="true" />
        </button>;
      })}</div>
      <p className="o-combat-rule">All attackers share the opposing health. The final blow ends the encounter. Retreat is your way out; inactivity triggers an automatic retreat with a counterattack.</p>
    </section> : battle.status === "completed" ? <section className="o-combat-result" aria-live="polite">
      <h2>{finishedTitles[battle.participant_status] ?? "Battle over"}</h2>
      <p>{outcomeLabel(battle.outcome)} Opening the combat log...</p>
      <Link href={"/combatlog/" + battle.id} className="o-training-button">View combat log</Link>
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
