"use client";

import { useNavigationActivity } from "@/components/game-refresh";

import { useActionState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Anchor, Compass, Ship, Waves } from "lucide-react";
import { gameplay, durationLabel } from "@/config/public";
import { travelAction } from "@/app/sea-actions";
import { useGameState } from "@/components/game-state";
import { Panel } from "@/components/shell";
import { useServerCountdown } from "@/hooks/use-server-countdown";
import { formatCountdown } from "@/lib/time";
import type { GameState } from "@/lib/game";
import type { SeaJourney, TravelResult } from "@/lib/sea-travel";

function Journey({ journey, observedAt }: { journey: SeaJourney; observedAt: string }) {
  const remaining = useServerCountdown(journey.arrives_at, observedAt);
  return <div className="o-sea-journey">
    <Ship size={40} aria-hidden="true" />
    <p className="o-eyebrow">{journey.kind === "return" ? "Homeward bound" : "Under sail"}</p>
    <h2>Traveling to {journey.destination.name}</h2>
    <p className="o-copy">{journey.kind === "return" ? "Returning from sea distance " + journey.from_step + " to The Harbor." : "Sailing to sea distance " + journey.target_step + "."}</p>
    <output className="o-sea-countdown" aria-label="Travel time remaining">{remaining ? formatCountdown(remaining) : "Arriving..."}</output>
    <p className="o-copy">Wait until you arrive to choose your next move. Your journey continues while you are away.</p>
  </div>;
}

function TravelControls({ state }: { state: GameState }) {
  const router = useRouter();
  const request = useRef<FormData | null>(null);
  const [result, action, pending] = useActionState<TravelResult, FormData>(async (_previous, form) => {
    if (!request.current) {
      form.set("request_id", crypto.randomUUID());
      request.current = form;
    }
    let response: TravelResult;
    try { response = await travelAction(request.current); }
    catch { response = { error: true, retry: true, message: "Departure could not be confirmed. Retry safely below." }; }
    if (!response.retry) request.current = null;
    if (!response.error) router.replace("/sea");
    return response;
  }, {});
  useNavigationActivity(pending);
  const blocked = pending || !!result.retry || !!state.active_combat_id;
  const atHarbor = state.sea.state === "in_harbor";
  const departureReason = state.hospital_until ? "You must leave hospital before sailing." :
    state.active_combat_id ? "Finish your current battle before leaving." :
    state.training.ship_job ? "Your ship upgrade must finish before you can leave." :
    state.energy < gameplay.seaTravel.departureEnergyCost ? "You need " + gameplay.seaTravel.departureEnergyCost + " Energy to leave." : null;
  return <form action={action} aria-label={atHarbor ? "Leave The Harbor" : "Choose your next voyage"} aria-busy={pending}>
    <input type="hidden" name="expected_version" value={state.sea.version} />
    {atHarbor ? <div className="o-sea-departure">
      <span className="o-departure-emblem" aria-hidden="true"><Ship /></span>
      <div><h2>The open sea awaits</h2><p className="o-copy">Sail to the waters just outside The Harbor. From there, choose where to go next.</p>
        <p className="o-copy">{gameplay.seaTravel.departureEnergyCost} Energy · {durationLabel(gameplay.seaTravel.outwardDurationSeconds)} to sea distance 1</p></div>
      <button className="o-primary" name="choice" value="depart" disabled={blocked || !!departureReason}><Ship size={16} aria-hidden="true" />Set sail</button>
      {departureReason && <p className="o-copy">{departureReason}</p>}
    </div> : <>
      <div className="o-sea-location"><Waves size={32} aria-hidden="true" /><div><p className="o-eyebrow">Sea distance {state.sea.step}</p><h2>{state.sea.place?.name}</h2><p className="o-copy">Choose a route to sail farther from The Harbor.</p></div></div>
      <div className="o-sea-routes">{state.sea.options.map((option, index) => <button key={option.id} name="choice" value={option.id} className="o-sea-route" disabled={blocked}>
        <Compass size={22} aria-hidden="true" /><span><small>Route {index + 1} · Sea distance {state.sea.step + 1}</small><strong>{option.name}</strong><small>{durationLabel(gameplay.seaTravel.outwardDurationSeconds)} · No Energy cost</small></span><span aria-hidden="true">›</span>
      </button>)}</div>
      <div className="o-sea-return"><button name="choice" value="return" className="o-training-button" disabled={blocked}><Anchor size={15} aria-hidden="true" />Return to The Harbor</button>
        <span>{durationLabel(state.sea.step * gameplay.seaTravel.returnSecondsPerStep)} · No Energy cost</span></div>
    </>}
    {!atHarbor && state.active_combat_id && <p className="o-copy">Finish your current battle before sailing.</p>}
    {(pending || result.message) && <div className="o-training-feedback" role="status"><p className={result.error ? "o-field-error" : ""}>{pending ? "Preparing your journey..." : result.message}</p></div>}
    {result.retry && <div className="o-panel-body"><button className="o-training-button" disabled={pending || !!state.active_combat_id || !!state.hospital_until}>Retry departure</button></div>}
  </form>;
}

export function SeaTravelPanel() {
  const state = useGameState();
  return <Panel icon={state.sea.state === "in_harbor" ? Ship : Compass} title={state.sea.state === "in_harbor" ? "Set sail" : "At Sea"} detail={state.sea.state === "traveling" ? "Journey in progress" : "Your voyage"}>
    {state.sea.state === "traveling" && state.sea.journey ? <Journey journey={state.sea.journey} observedAt={state.observed_at} /> :
      <TravelControls key={state.sea.version} state={state} />}
    <div className="o-panel-foot o-sea-note">Energy: +{gameplay.resources.energyRecoveryAmount} every {durationLabel(gameplay.resources.energyRecoverySeconds * 2)} at sea, including journeys, on the server clock. Scout to find ships at your Sea distance.</div>
  </Panel>;
}
