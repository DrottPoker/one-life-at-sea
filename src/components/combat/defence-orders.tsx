"use client";

import { useNavigationActivity } from "@/components/game-refresh";

import { GameLink as Link } from "@/components/game-navigation";
import { useActionState } from "react";
import { Crosshair, Lock, Shield, Swords } from "lucide-react";
import { saveDefence } from "@/app/combat-actions";
import { useGameState } from "@/components/game-state";

export function DefenceOrders() {
  const state = useGameState();
  const [result, action, pending] = useActionState(saveDefence, {});
  useNavigationActivity(pending);
  const blocked = pending || !!state.active_combat_id || !!state.hospital_until || state.sea.state !== "in_harbor";
  const OrderIcon = state.defence_order === "boarding" ? Swords : Crosshair;
  return <section className="o-profile-card o-defence" aria-labelledby="defence-heading">
    <header className="o-profile-card-head"><h2 id="defence-heading"><Shield aria-hidden="true" />Defence orders</h2><span><Lock aria-hidden="true" />Only visible to you</span></header>
    <form action={action}>
      <p className="o-copy">Used while you are away.</p>
      <div className="o-defence-order">
        <OrderIcon aria-hidden="true" />
        <label htmlFor="defence-preset">At sea</label>
        <select name="preset" id="defence-preset" disabled={blocked} defaultValue={state.defence_order} key={state.defence_order}>
          <option value="cannon">Cannon focus</option>
          <option value="boarding">Boarding focus</option>
        </select>
        <button className="o-training-button" disabled={blocked}>{pending ? "Saving..." : "Save orders"}</button>
      </div>
      <p className="o-copy">Cannon focus fires while salvos remain, then boards. Boarding focus boards immediately. Your crew attacks during boarding.</p>
      {state.sea.state !== "in_harbor" && <p className="o-copy">Return to The Harbor to change defence orders.</p>}
      {state.active_combat_id && <p className="o-copy">Finish your current fight before changing defence orders.</p>}
      {state.hospital_until && <p className="o-copy">Defence orders cannot be changed while in hospital.</p>}
      <p className="o-feedback" role="status">{result.message}</p>
    </form>
    {(!state.hospital_until && !state.active_combat_id && state.last_combat_id) && <div className="o-profile-card-foot">
      <Link href={"/combatlog/" + state.last_combat_id}>
        View last combat report
      </Link>
    </div>}
  </section>;
}
