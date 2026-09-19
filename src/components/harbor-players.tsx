"use client";

import { frontend } from "@/config/public";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { Anchor } from "lucide-react";
import { subscribeToForeground } from "@/lib/browser-events";
import { createClient } from "@/lib/supabase/browser";
import { HARBOR_PAGE_SIZE, loadHarborRoster, type HarborRoster, type HarborPlayer } from "@/lib/harbor";

function CaptainProfileLink({ player }: { player: HarborPlayer }) {
  const [prefetch, setPrefetch] = useState(false);
  return <Link className="o-roster-name" href={`/characters/${player.character_id}`}
    prefetch={prefetch ? "auto" : false} onPointerEnter={() => setPrefetch(true)} onFocus={() => setPrefetch(true)}>
    {player.display_name}
  </Link>;
}

export function HarborPlayers({ initial, characterId }: { initial: HarborRoster | null; characterId: string }) {
  const [roster, setRoster] = useState(initial);
  const [page, setPage] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [connection, setConnection] = useState("Connecting");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(!initial);
  const instance = useId();

  useEffect(() => {
    const client = createClient();
    const abort = new AbortController();
    let disposed = false;
    let fetching = false;
    let dirty = false;
    let joined = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // Serialize snapshots so an older request cannot replace a newer list.
    async function refresh() {
      if (disposed) return;
      if (fetching) { dirty = true; return; }
      fetching = true;
      dirty = false;
      setLoading(true);
      try {
        const next = await loadHarborRoster(client, page, abort.signal);
        if (!disposed) {
          setRoster(next);
          setPage(next.page);
          setError(false);
        }
      } catch {
        if (!disposed) setError(true);
      } finally {
        fetching = false;
        if (!disposed) {
          setLoading(false);
          if (dirty) schedule();
        }
      }
    }

    function schedule() {
      if (timer) return;
      timer = setTimeout(() => { timer = undefined; void refresh(); }, frontend.refresh.realtimeDebounceMs);
    }

    const channel = client.channel(`harbor-roster-${instance}-${page}-${attempt}`, { config: { postgres_changes_options: { wait: true } } })
      .on("postgres_changes", { event: "*", schema: "public", table: "harbor_players" }, payload => {
        if (disposed) return;
        if (payload.errors?.length) { setError(true); return; }
        schedule();
      });

    async function connect() {
      try {
        // Resolve cookie-backed auth before joining the database subscription.
        await client.realtime.setAuth();
        if (disposed) return;
        channel.subscribe(status => {
        if (disposed) return;
        if (status === "SUBSCRIBED") {
          joined = true;
          setConnection("Live");
          schedule();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          joined = false;
          setConnection("Reconnecting");
        }
        });
      } catch {
        if (!disposed) setConnection("Reconnecting");
      }
    }
    void connect();

    const foreground = () => {
      if (document.visibilityState === "visible") {
        if (navigator.onLine && joined) setConnection("Live");
        schedule();
      }
    };
    const offline = () => setConnection("Reconnecting");
    const unsubscribeForeground = subscribeToForeground(foreground);
    window.addEventListener("offline", offline);
    schedule();

    return () => {
      disposed = true;
      abort.abort();
      clearTimeout(timer);
      unsubscribeForeground();
      window.removeEventListener("offline", offline);
      void client.removeChannel(channel);
    };
  }, [page, attempt, instance]);

  const currentPage = roster?.page ?? 0;
  const total = roster?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / HARBOR_PAGE_SIZE));
  const status = error ? "Updates paused" : connection;

  return <section className="o-panel o-harbor-players" aria-labelledby="harbor-players-title">
    <header className="o-panel-title">
      <h2 id="harbor-players-title">Captains in The Harbor <span className="o-roster-count">({total})</span></h2>
      <span className="o-roster-connection" role="status" aria-label="Player list connection" data-live={status === "Live"}>{status}</span>
    </header>
    <div className="o-roster-intro"><p>Captains currently docked here, including those away from the game.</p></div>
    {roster ? <ul className="o-roster-list" aria-label="Captains in The Harbor" aria-busy={loading}>
      {roster.players.map(player => <li key={player.character_id}>
        <Anchor aria-hidden="true" />
        <CaptainProfileLink player={player} />
        {player.character_id === characterId && <span className="o-roster-you">You</span>}
      </li>)}
      {total === 0 && <li className="o-roster-empty">No captains are docked here.</li>}
    </ul> : <p className="o-panel-body">{error ? "The captain list is unavailable." : "Loading captains..."}</p>}
    <div className="o-panel-foot o-roster-footer">
      <span aria-live="polite">{total === 0 ? "0 captains" : `${currentPage * HARBOR_PAGE_SIZE + 1}-${Math.min((currentPage + 1) * HARBOR_PAGE_SIZE, total)} of ${total} captains`}</span>
      {pageCount > 1 && <nav aria-label="Player list pages">
        <button type="button" disabled={loading || currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button>
        <span>Page {currentPage + 1} of {pageCount}</span>
        <button type="button" disabled={loading || currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Next</button>
      </nav>}
    </div>
    {(error || connection === "Reconnecting") && <div className="o-roster-retry" role="status">
      <span>The list may be out of date. Reconnecting...</span>
      <button type="button" className="o-text-button" onClick={() => { setConnection("Connecting"); setAttempt(value => value + 1); }}>Retry</button>
    </div>}
  </section>;
}
