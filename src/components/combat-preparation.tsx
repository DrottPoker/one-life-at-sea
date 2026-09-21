"use client";

import { gameplay, frontend } from "@/config/public";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startFight } from "@/app/combat-actions";
import { CombatStage } from "@/components/combat-stage";
import { useGameState } from "@/components/game-state";
import { COMBAT_COST, combatError, type CombatPreview } from "@/lib/combat";

export function CombatPreparation({ preview }: { preview: CombatPreview }) {
  const router = useRouter();
  const state = useGameState();
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const request = useRef<string | null>(null);
  const inFlight = useRef(false);
  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === "visible" && !inFlight.current) router.refresh(); }, frontend.refresh.combatPreviewMs);
    return () => clearInterval(timer);
  }, [router]);

  function start() {
    if (inFlight.current || state.active_combat_id) return;
    inFlight.current = true;
    request.current ??= crypto.randomUUID();
    const requestId = request.current;
    setMessage("");
    startTransition(async () => {
      try {
        const result = await startFight(preview.defender.id, requestId);
        if (result.battleId) router.refresh();
        else setMessage(result.message ?? "The fight could not be started.");
      } catch {
        setMessage("Connection interrupted. Try again to recover the same start request.");
      } finally { inFlight.current = false; }
    });
  }

  return <>
    <div className="o-combat-intro"><strong>{preview.join_combat_id ? "An attack is already underway" : "Prepare for an encounter"}</strong>
      <p>{preview.join_combat_id ? "Join the attackers with your own orders. You share the opposing ship and crew health." : "Inspect your condition before committing. The opposing equipment will be revealed when the fight starts."}</p></div>
    <CombatStage attacker={preview.attacker} defender={preview.defender} phase="sea" />
    <div className="o-combat-start">
      <div><h2>Give the order</h2><p>Both captains act each round. Your opponent follows saved defence orders.</p>
        <p className="o-copy">You can attack while injured. At least {gameplay.combat.minimumHealth} Ship Health and {gameplay.combat.minimumHealth} Crew Health are required.</p></div>
      <button className="o-training-button o-combat-start-button" disabled={pending || !!state.active_combat_id || !preview.can_start} onClick={start}>
        {pending && <span className="o-spinner" aria-hidden="true" />}
        {pending ? "Entering battle..." : preview.join_combat_id ? "Join battle" : "Start battle"}
        <small>{COMBAT_COST} Energy</small>
      </button>
    </div>
    {state.active_combat_id && <p className="o-combat-message">Finish your current fight before starting another.</p>}
    {!preview.can_start && <div className="o-combat-message">
      <p>{combatError(preview.reason ?? "")}</p>
      {preview.target_protected_until && <p>Protection ends at <time dateTime={preview.target_protected_until}>
        {new Date(preview.target_protected_until).toLocaleTimeString(frontend.site.locale, { timeZone: frontend.site.logTimeZone })} {frontend.site.logTimeZone}</time>.</p>}
      <button className="o-text-button" onClick={() => router.refresh()}>Check availability</button>
    </div>}
    <p className="o-combat-feedback" role="status">{message}</p>
    <div className="o-panel-foot o-combat-foot"><Link href={"/characters/" + preview.defender.id}>Back to profile</Link><span>Opening this screen costs no Energy.</span></div>
  </>;
}
