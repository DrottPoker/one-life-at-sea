"use client";

import { GameLink as Link } from "@/components/game-navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { Binoculars, Ship } from "lucide-react";
import { gameplay, frontend } from "@/config/public";
import { scoutAction } from "@/app/scout-actions";
import { useGameState } from "@/components/game-state";
import { createClient } from "@/lib/supabase/browser";
import type { ScoutActionResult, ScoutPage } from "@/lib/sea-scouting";

function ScoutResults({ scoutId }: { scoutId: string }) {
  const [page, setPage] = useState(0), [attempt, setAttempt] = useState(0);
  const [snapshot, setSnapshot] = useState<{ page: number; attempt: number; data: ScoutPage | null; error: boolean } | null>(null);
  useEffect(() => {
    const controller = new AbortController(), client = createClient();
    async function load() {
      try {
        const read = () => client.rpc("get_sea_scout", { requested_page: page }).abortSignal(controller.signal);
        let response = await read();
        if (response.error?.code === "40001" && !controller.signal.aborted) response = await read();
        const { data, error } = response;
        if (!controller.signal.aborted) setSnapshot({ page, attempt, data, error: !!error || !data || data.id !== scoutId });
      } catch {
        if (!controller.signal.aborted) setSnapshot({ page, attempt, data: null, error: true });
      }
    }
    void load();
    return () => controller.abort();
  }, [page, attempt, scoutId]);
  if (!snapshot || snapshot.page !== page || snapshot.attempt !== attempt) return <p className="o-panel-body" role="status">Loading spotted ships...</p>;
  if (snapshot.error || !snapshot.data) return <p className="o-panel-body" role="status">Your saved scouting result could not be loaded. <button className="o-text-button" onClick={() => setAttempt(a => a + 1)}>Retry list</button></p>;
  const result = snapshot.data, pageSize = gameplay.seaTravel.scoutPageSize;
  const pages = Math.max(1, Math.ceil(result.total / pageSize));
  return <>
    <p className="o-panel-body o-copy">Ships spotted at Sea distance {result.sea_distance} on <time dateTime={result.scouted_at}>
      {new Date(result.scouted_at).toLocaleString(frontend.site.locale, { timeZone: frontend.site.logTimeZone })}
    </time>. Scout again to find new arrivals. A ship may have moved since you spotted it.</p>
    <ul className="o-roster-list" aria-label="Spotted ships">
      {result.players.map(player => <li key={player.character_id}>
        <Ship size={14} aria-hidden="true" /><Link className="o-roster-name" href={"/characters/" + player.character_id} prefetch={false}>{player.display_name}</Link>
      </li>)}
      {!result.total && <li className="o-roster-empty">No other ships were found at this Sea distance.</li>}
    </ul>
    <div className="o-panel-foot o-roster-footer">
      <span>{result.total} {result.total === 1 ? "ship" : "ships"} found</span>
      {pages > 1 && <nav aria-label="Scouting result pages">
        <button type="button" disabled={result.page === 0} onClick={() => setPage(result.page - 1)}>Previous</button>
        <span>Page {result.page + 1} of {pages}</span>
        <button type="button" disabled={result.page + 1 >= pages} onClick={() => setPage(result.page + 1)}>Next</button>
      </nav>}
    </div>
  </>;
}

function ScoutControls() {
  const state = useGameState(), request = useRef<FormData | null>(null);
  const [result, action, pending] = useActionState<ScoutActionResult, FormData>(async (_previous, form) => {
    if (!request.current) { form.set("request_id", crypto.randomUUID()); request.current = form; }
    let response: ScoutActionResult;
    try { response = await scoutAction(request.current); }
    catch { response = { error: true, retry: true, message: "Scouting could not be confirmed. Retry safely below." }; }
    if (!response.retry) request.current = null;
    return response;
  }, {});
  const reason = state.active_combat_id ? "Finish your current battle before scouting." :
    state.energy < gameplay.seaTravel.scoutEnergyCost ? "You need " + gameplay.seaTravel.scoutEnergyCost + " Energy to scout." : null;
  return <form action={action} className="o-panel-body" aria-label="Scout nearby ships" aria-busy={pending}>
    <input type="hidden" name="expected_version" value={state.sea.version} />
    <p className="o-copy">Search for other captains at Sea distance {state.sea.step}, whichever place they are visiting.</p>
    <button className="o-training-button" disabled={pending || !!state.active_combat_id || (!result.retry && !!reason)}>
      <Binoculars size={16} aria-hidden="true" />{pending ? "Scouting..." : result.retry ? "Retry scouting" : "Scout nearby ships"}
    </button>
    <p className="o-copy">{gameplay.seaTravel.scoutEnergyCost} Energy per search. Opening profiles costs no Energy.</p>
    {reason && (!result.retry || state.active_combat_id) && <p className="o-copy">{reason}</p>}
    {result.message && <p className={result.error ? "o-field-error" : "o-copy"} role="status">{result.message}</p>}
  </form>;
}

export function SeaScouting() {
  const state = useGameState();
  if (state.sea.state !== "at_sea") return null;
  return <section className="o-panel" aria-label="Nearby ships">
    <header className="o-panel-title"><h2>Nearby ships</h2><small>Scout the horizon</small></header>
    <ScoutControls key={state.sea.version} />
    {state.sea.scout_id && <ScoutResults key={state.sea.scout_id} scoutId={state.sea.scout_id} />}
  </section>;
}
