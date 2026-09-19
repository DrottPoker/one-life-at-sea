"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { HeartPulse } from "lucide-react";
import { frontend, gameplay, durationLabel } from "@/config/public";
import { createClient } from "@/lib/supabase/browser";
import { useGameState } from "@/components/game-state";
import { HospitalCountdown } from "@/components/hospital-countdown";
import type { HospitalRoster } from "@/lib/hospital";

export function HospitalPanel({ initial, characterId }: { initial: HospitalRoster | null; characterId: string }) {
  const state = useGameState(), router = useRouter(), instance = useId();
  const [roster, setRoster] = useState(initial), [page, setPage] = useState(0);
  const [error, setError] = useState(false), [attempt, setAttempt] = useState(0);
  const wasPatient = useRef(!!state.hospital_until);
  useEffect(() => {
    if (state.hospital_until) wasPatient.current = true;
    else if (wasPatient.current) { wasPatient.current = false; router.replace("/harbor"); }
  }, [state.hospital_until, router]);
  useEffect(() => {
    const client = createClient(), abort = new AbortController();
    let disposed = false, fetching = false, dirty = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function refresh() {
      if (disposed) return;
      if (fetching) { dirty = true; return; }
      fetching = true; dirty = false;
      const { data, error } = await client.rpc("list_hospital_patients", { requested_page: page }).abortSignal(abort.signal);
      fetching = false;
      if (disposed) return;
      if (error || !data) setError(true);
      else { setRoster(data); setPage(data.page); setError(false); }
      clearTimeout(timer);
      const deadline = data?.next_discharge_at ? Date.parse(data.next_discharge_at) - Date.parse(data.observed_at) + frontend.refresh.resourceGraceMs : frontend.refresh.fallbackMs;
      timer = setTimeout(() => void refresh(), dirty ? frontend.refresh.realtimeDebounceMs :
        Math.max(frontend.refresh.resourceMinimumMs, Math.min(deadline, frontend.refresh.fallbackMs)));
    }
    const schedule = () => { clearTimeout(timer); timer = setTimeout(() => void refresh(), frontend.refresh.realtimeDebounceMs); };
    const channel = client.channel("hospital-" + instance + "-" + page + "-" + attempt)
      .on("postgres_changes", { event: "*", schema: "public", table: "hospital_patients" }, schedule);
    void client.realtime.setAuth().then(() => {
      if (!disposed) channel.subscribe(status => { if (status === "SUBSCRIBED") schedule(); });
    }).catch(() => { if (!disposed) setError(true); });
    const foreground = () => { if (document.visibilityState === "visible") schedule(); };
    window.addEventListener("focus", foreground);
    window.addEventListener("online", foreground);
    document.addEventListener("visibilitychange", foreground);
    schedule();
    return () => {
      disposed = true; abort.abort(); clearTimeout(timer); void client.removeChannel(channel);
      window.removeEventListener("focus", foreground);
      window.removeEventListener("online", foreground);
      document.removeEventListener("visibilitychange", foreground);
    };
  }, [page, instance, attempt]);
  const total = roster?.total ?? 0, currentPage = roster?.page ?? 0;
  const pages = Math.max(1, Math.ceil(total / gameplay.harbor.pageSize));
  return <>
    <div className="o-hospital-intro">
      {state.hospital_until ? <div className="o-hospital-stay" role="status">
        <HeartPulse aria-hidden="true" /><div><h2>You are in hospital</h2>
          <p>Your crew is recovering. Game actions are unavailable until you are discharged.</p></div>
        <HospitalCountdown until={state.hospital_until} observedAt={state.observed_at} />
      </div> : <><h2>A place to recover</h2><p className="o-copy">When your crew dies or your ship sinks, you recover here for {durationLabel(gameplay.hospital.durationSeconds)}. Your character and progress are kept.</p>
        <Link href="/harbor">Back to The Harbor</Link></>}
      <p className="o-form-hint">Discharge is automatic, even while away. Your ship and crew return at full health.</p>
    </div>
    <div className="o-section-bar"><h2>Captains in hospital ({total})</h2></div>
    <ul className="o-roster-list" aria-label="Captains in hospital">
      {roster?.patients.map(patient => <li key={patient.character_id}><HeartPulse aria-hidden="true" /><Link className="o-roster-name" href={"/characters/" + patient.character_id}>{patient.display_name}</Link>
        {patient.character_id === characterId && <span className="o-roster-you">You</span>}</li>)}
      {roster && !total && <li className="o-roster-empty">No captains are in hospital.</li>}
      {!roster && <li className="o-roster-empty">{error ? "The patient list could not be loaded." : "Loading patients..."}</li>}
    </ul>
    <div className="o-panel-foot o-roster-footer"><span>{total} {total === 1 ? "captain" : "captains"}</span>
      {pages > 1 && <nav aria-label="Hospital list pages"><button type="button" disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>Previous</button>
        <span>Page {currentPage + 1} of {pages}</span><button type="button" disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>Next</button></nav>}
      {error && <button type="button" className="o-text-button" onClick={() => setAttempt(a => a + 1)}>Retry patient list</button>}
    </div>
  </>;
}
