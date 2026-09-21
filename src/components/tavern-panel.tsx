"use client";

import { useActionState, useRef } from "react";
import { gameplay, durationLabel } from "@/config/public";
import { useEconomyRequests } from "@/components/economy-requests";
import { useGameState } from "@/components/game-state";
import { formatGold } from "@/lib/bank";
import { formatMorale, formatMoraleBonus, type TavernResult } from "@/lib/morale";

export function TavernPanel() {
  const state = useGameState(), journal = useEconomyRequests(), offer = gameplay.morale;
  const request = useRef<FormData | null>(null);
  const [result, action, pending] = useActionState<TavernResult, FormData>(async (_previous, form) => {
    if (!request.current) {
      form.set("request_id", crypto.randomUUID());
      request.current = form;
    }
    const response = await journal.tavern(request.current);
    if (!response.retry) request.current = null;
    return response;
  }, {});
  const locked = !!state.active_combat_id || !!state.hospital_until || state.sea.state !== "in_harbor";
  const gain = Math.max(0, Math.min(offer.tavernGain, offer.maximum - state.crew_morale));
  return <div className="o-panel-body o-tavern">
    <h2 className="o-training-heading">A warm meal for the crew.</h2>
    <p className="o-copy">Gather your crew around the table. A shared meal raises morale by {formatMorale(offer.tavernGain)} for {formatGold(offer.tavernGoldCost)} Gold Coins.</p>
    <dl className="o-tavern-summary">
      <div><dt>Current morale</dt><dd>{formatMorale(state.crew_morale)}</dd></div>
      <div><dt>Crew stats</dt><dd>{formatMoraleBonus(state.crew_morale)}</dd></div>
      <div><dt>Training gains</dt><dd>{formatMoraleBonus(state.crew_morale, "training")}</dd></div>
    </dl>
    <p className="o-copy">No Energy cost. Morale moves {offer.recoveryAmount} towards 0 every {durationLabel(offer.recoverySeconds)} on the server clock, even while offline.</p>
    <form action={action} aria-label="Crew meal" aria-busy={pending}>
      <input type="hidden" name="gold_cost" value={offer.tavernGoldCost} />
      <input type="hidden" name="morale_gain" value={offer.tavernGain} />
      <button className="o-training-button" type="submit"
        disabled={locked || pending || (!result.retry && (journal.unconfirmed || gain === 0 || state.gold_coins < offer.tavernGoldCost))}>
        {pending ? "Serving..." : result.retry ? "Retry meal" : "Buy crew meal for " + formatGold(offer.tavernGoldCost) + " Gold Coins"}
      </button>
    </form>
    <p className="o-copy">{gain === 0 ? "Your crew is already at maximum morale." :
      "This meal raises morale by " + formatMorale(gain) + ", to " + formatMorale(state.crew_morale + gain) + "."}
      {gain > 0 && gain < offer.tavernGain && " The full meal price applies."}</p>
    {state.gold_coins < offer.tavernGoldCost && <p className="o-copy">You need {formatGold(offer.tavernGoldCost)} Gold Coins on your character.</p>}
    {locked && <p className="o-copy">Meals are available in The Harbor when your crew is out of combat and hospital.</p>}
    <div className="o-bank-feedback" role="status" aria-atomic="true">
      {result.message && !pending && <p className={result.error ? "o-field-error" : ""}>{result.message}</p>}
    </div>
  </div>;
}
