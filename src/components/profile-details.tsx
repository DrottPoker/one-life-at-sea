"use client";

import { GameLink as Link } from "@/components/game-navigation";
import { useEffect, useId, useState } from "react";
import { HeartPulse, MapPin, Swords } from "lucide-react";
import { subscribeToForeground } from "@/lib/browser-events";
import { createSnapshotPoller, snapshotRefreshDelay } from "@/lib/snapshot-poller";
import { createClient } from "@/lib/supabase/browser";
import type { CharacterProfile } from "@/lib/database.types";
import type { CharacterStatus } from "@/lib/sea-travel";
import { useGameState } from "@/components/game-state";
import { HospitalCountdown } from "@/components/hospital-countdown";

export function ProfileDetails({ profile, initialStatus, joined, age, ownProfile }: {
  profile: CharacterProfile; initialStatus: CharacterStatus; joined: string; age: string; ownProfile: boolean;
}) {
  const viewer = useGameState(), instance = useId();
  const [live, setLive] = useState(initialStatus), [error, setError] = useState(false), [attempt, setAttempt] = useState(0);
  const hospital = Date.parse(initialStatus.observed_at) > Date.parse(live.observed_at) ? initialStatus : live;
  useEffect(() => {
    const client = createClient();
    let disposed = false;
    const poller = createSnapshotPoller({
      async load(signal) {
        const { data, error } = await client.rpc("get_character_status", { target_id: profile.character_id }).abortSignal(signal);
        if (error || !data) throw new Error("Character snapshot unavailable.");
        return data;
      },
      onData(data) {
        setLive(data);
        setError(false);
      },
      onError: () => setError(true),
      nextDelay: data => Math.min(snapshotRefreshDelay(data.hospital_until, data.observed_at), snapshotRefreshDelay(data.arrives_at, data.observed_at)),
    });
    const schedule = () => poller.schedule();
    const channel = client.channel("profile-hospital-" + instance + "-" + attempt)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "hospital_patients", filter: "character_id=eq." + profile.character_id }, schedule)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "hospital_patients", filter: "character_id=eq." + profile.character_id }, schedule)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "hospital_patients" },
        payload => { if (payload.old.character_id === profile.character_id) schedule(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "character_profiles", filter: "character_id=eq." + profile.character_id }, schedule);
    void client.realtime.setAuth().then(() => {
      if (!disposed) channel.subscribe(status => { if (status === "SUBSCRIBED") schedule(); });
    }).catch(() => { if (!disposed) setError(true); });
    const unsubscribeForeground = subscribeToForeground(schedule);
    schedule();
    return () => {
      disposed = true; poller.dispose(); void client.removeChannel(channel);
      unsubscribeForeground();
    };
  }, [profile.character_id, instance, attempt]);
  const inHospital = !!hospital.hospital_until;
  const location = inHospital ? "Hospital" : hospital.location === "the_harbor" ? "The Harbor" : hospital.location === "traveling" ? "Traveling" : "At sea";
  const attackBlocked = !!viewer.active_combat_id || !!viewer.hospital_until || inHospital || error || !hospital.can_attack_here;
  return <>
    <dl className="o-profile-details">
      <div><dt>Player ID</dt><dd><output aria-label="Player ID">{profile.player_number}</output></dd></div>
      <div><dt>Character Level</dt><dd><output aria-label="Character Level">{hospital.character_level}</output></dd></div>
      <div><dt>Location</dt><dd><MapPin aria-hidden="true" />{location}</dd></div>
      {hospital.hospital_until && <>
        <div><dt>Status</dt><dd><HeartPulse aria-hidden="true" />In hospital</dd></div>
        <div><dt>Time remaining</dt><dd><HospitalCountdown until={hospital.hospital_until} observedAt={hospital.observed_at} /></dd></div>
      </>}
      <div><dt>Max sea distance</dt><dd><output aria-label="Max sea distance">{hospital.max_sea_distance}</output></dd></div>
      <div><dt>At sea since</dt><dd><time dateTime={profile.created_at}>{joined}</time></dd></div>
      <div><dt>Character age</dt><dd>{age}</dd></div>
    </dl>
    {error && <p className="o-feedback" role="status">Character status could not be refreshed. <button className="o-text-button" onClick={() => setAttempt(a => a + 1)}>Retry status</button></p>}
    {!ownProfile && <div className="o-profile-actions">
      {attackBlocked ? <button className="o-training-button" disabled><Swords size={14} aria-hidden="true" />Attack</button> :
        <Link className="o-training-button" href={"/attack/" + profile.player_number} prefetch={false}><Swords size={14} aria-hidden="true" />Attack</Link>}
    </div>}
  </>;
}
