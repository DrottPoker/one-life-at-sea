"use client";

import Link from "next/link";
import { useActionState } from "react";
import { saveDefence } from "@/app/combat-actions";
import { useGameState } from "@/components/game-state";

export function DefenceOrders() {
  const state = useGameState();
  const [result, action, pending] = useActionState(saveDefence, {});
  const blocked = pending || !!state.hospital_until;
  return <section className="o-defence" aria-labelledby="defence-heading">
    <div className="o-section-bar"><h2 id="defence-heading">Defence orders</h2><span>Used while you are away</span></div>
    <form action={action}>
      <label htmlFor="defence-preset">At sea</label>
      <select name="preset" id="defence-preset" disabled={blocked} defaultValue={state.defence_order} key={state.defence_order}>
        <option value="cannon">Cannon focus</option>
        <option value="boarding">Boarding focus</option>
      </select>
      <button className="o-training-button" disabled={blocked}>{pending ? "Saving..." : "Save orders"}</button>
      <p className="o-copy">Cannon focus fires while salvos remain, then boards. Boarding focus boards immediately. Your crew attacks during boarding.</p>
      {state.hospital_until && <p className="o-copy">Defence orders cannot be changed while in hospital.</p>}
      <p className="o-feedback" role="status">{result.message}</p>
    </form>
    {(!state.hospital_until && !state.active_combat_id && state.last_combat_id) && <div className="o-panel-foot">
      <Link href={"/combatlog/" + state.last_combat_id}>
        View last combat report
      </Link>
    </div>}
  </section>;
}
