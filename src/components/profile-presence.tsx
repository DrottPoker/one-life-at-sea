"use client";

import { useEffect, useState, type ReactNode } from "react";
import { lastActionLabel, nextPresenceRefreshMs, presenceStatus, type PlayerPresence } from "@/lib/player-presence";

export function ProfilePresence({ presence, observedAt, stale, name, playerNumber, children }: {
  presence: PlayerPresence; observedAt: string; stale: boolean;
  name: string; playerNumber: number; children: ReactNode;
}) {
  const [elapsed, setElapsed] = useState({ anchor: observedAt, milliseconds: 0 });
  useEffect(() => {
    const start = performance.now();
    let timer: ReturnType<typeof setTimeout>;
    function schedule() {
      timer = setTimeout(() => {
        setElapsed({ anchor: observedAt, milliseconds: performance.now() - start });
        schedule();
      }, nextPresenceRefreshMs(presence, observedAt, performance.now() - start));
    }
    schedule();
    return () => clearTimeout(timer);
  }, [observedAt, presence]);
  const milliseconds = elapsed.anchor === observedAt ? elapsed.milliseconds : 0;
  const status = presenceStatus(presence, observedAt, milliseconds);
  const label = status === "online" ? "Online" : status === "idle" ? "Idle" : "Offline";
  return <>
    <header className="o-profile-identity">
      <h2 aria-label={name + " [" + playerNumber + "]"}>
        <span className="o-player-presence o-profile-heading-presence" data-presence={stale ? "unknown" : status}
          title={stale ? "Unavailable" : label} role="img" aria-label={"Player status: " + (stale ? "Unavailable" : label)}><span className="o-presence-dot" /></span>
        <span className="o-profile-name">{name} <span className="o-profile-number">[<output aria-label="Player ID">{playerNumber}</output>]</span></span>
      </h2>
      <p>Captain</p>
    </header>
    <dl className="o-profile-details">
      <div><dt>Last action</dt><dd>
        <span aria-label="Last action" title={presence.last_action_at ? new Date(presence.last_action_at).toUTCString() : undefined}>
          {lastActionLabel(presence.last_action_at, observedAt, milliseconds)}{stale && " (last known)"}
        </span>
      </dd></div>
      {children}
    </dl>
  </>;
}
