"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { HeartPulse, MapPin, Swords } from "lucide-react";
import { frontend } from "@/config/public";
import { createClient } from "@/lib/supabase/browser";
import type { CharacterProfile } from "@/lib/database.types";
import type { HospitalStatus } from "@/lib/hospital";
import { useGameState } from "@/components/game-state";
import { HospitalCountdown } from "@/components/hospital-countdown";

export function ProfileDetails({ profile, initialHospital, joined, age, ownProfile }: {
  profile: CharacterProfile; initialHospital: HospitalStatus; joined: string; age: string; ownProfile: boolean;
}) {
  const viewer = useGameState(), instance = useId();
  const [live, setLive] = useState(initialHospital), [error, setError] = useState(false), [attempt, setAttempt] = useState(0);
  const hospital = Date.parse(initialHospital.observed_at) > Date.parse(live.observed_at) ? initialHospital : live;
  useEffect(() => {
    const client = createClient(), abort = new AbortController();
    let disposed = false, fetching = false, dirty = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function refresh() {
      if (disposed) return;
      if (fetching) { dirty = true; return; }
      fetching = true; dirty = false;
      let delay = frontend.refresh.fallbackMs;
      try {
        const { data, error } = await client.rpc("get_hospital_status", { target_id: profile.character_id }).abortSignal(abort.signal);
        if (disposed) return;
        if (error || !data) setError(true);
        else {
          setLive(data); setError(false);
          if (data.hospital_until) delay = Math.max(frontend.refresh.resourceMinimumMs,
            Math.min(delay, Date.parse(data.hospital_until) - Date.parse(data.observed_at) + frontend.refresh.resourceGraceMs));
        }
      } catch { if (!disposed) setError(true); }
      finally {
        fetching = false;
        if (!disposed) {
          clearTimeout(timer);
          timer = setTimeout(() => void refresh(), dirty ? frontend.refresh.realtimeDebounceMs : delay);
        }
      }
    }
    const schedule = () => { clearTimeout(timer); timer = setTimeout(() => void refresh(), frontend.refresh.realtimeDebounceMs); };
    const channel = client.channel("profile-hospital-" + instance + "-" + attempt)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "hospital_patients", filter: "character_id=eq." + profile.character_id }, schedule)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "hospital_patients", filter: "character_id=eq." + profile.character_id }, schedule)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "hospital_patients" },
        payload => { if (payload.old.character_id === profile.character_id) schedule(); });
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
  }, [profile.character_id, instance, attempt]);
  const inHospital = !!hospital.hospital_until;
  const location = inHospital ? "Hospital" : profile.location === "the_harbor" ? "The Harbor" : "At sea";
  const attackBlocked = !!viewer.hospital_until || inHospital || error;
  return <>
    <dl className="o-profile-details">
      <div><dt>Location</dt><dd><MapPin aria-hidden="true" />{location}</dd></div>
      {hospital.hospital_until && <>
        <div><dt>Status</dt><dd><HeartPulse aria-hidden="true" />In hospital</dd></div>
        <div><dt>Time remaining</dt><dd><HospitalCountdown until={hospital.hospital_until} observedAt={hospital.observed_at} /></dd></div>
      </>}
      <div><dt>At sea since</dt><dd><time dateTime={profile.created_at}>{joined}</time></dd></div>
      <div><dt>Character age</dt><dd>{age}</dd></div>
    </dl>
    {error && <p className="o-feedback" role="status">Hospital status could not be refreshed. <button className="o-text-button" onClick={() => setAttempt(a => a + 1)}>Retry status</button></p>}
    {!ownProfile && <div className="o-profile-actions">
      {attackBlocked ? <button className="o-training-button" disabled><Swords size={14} aria-hidden="true" />Attack</button> :
        <Link className="o-training-button" href={"/attack/" + profile.character_id} prefetch={false}><Swords size={14} aria-hidden="true" />Attack</Link>}
    </div>}
  </>;
}
