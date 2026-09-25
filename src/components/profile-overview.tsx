"use client";

import Image from "next/image";
import { GameLink as Link } from "@/components/game-navigation";
import { useEffect, useId, useState, type ReactNode } from "react";
import { HeartPulse, MapPin, Swords, Mail, ScrollText, Timer } from "lucide-react";
import { subscribeToForeground } from "@/lib/browser-events";
import { createSnapshotPoller, snapshotRefreshDelay } from "@/lib/snapshot-poller";
import { createClient } from "@/lib/supabase/browser";
import type { CharacterProfile } from "@/lib/database.types";
import type { CharacterStatus } from "@/lib/sea-travel";
import { forumSearchUrl, type ForumAuthorStats } from "@/lib/forums";
import { useGameState } from "@/components/game-state";
import { HospitalCountdown } from "@/components/hospital-countdown";
import { CaptainPortrait, PROFILE_HEADER } from "@/components/captain-portrait";
import { usePresenceClock } from "@/hooks/use-presence-clock";

// Hero and details follow the live character status; skills and defence orders are owner-only slots.
export function ProfileOverview({ profile, initialStatus, joined, ageDays, ownProfile, forum, skills, defence }: {
  profile: CharacterProfile; initialStatus: CharacterStatus; joined: string; ageDays: number; ownProfile: boolean; forum: ForumAuthorStats; skills: ReactNode; defence: ReactNode;
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
  const location = inHospital ? "In hospital" : hospital.location === "the_harbor" ? "The Harbor" : hospital.location === "traveling" ? "Traveling" : "At sea";
  const attackBlocked = !!viewer.active_combat_id || !!viewer.hospital_until || inHospital || error || !hospital.can_attack_here;
  const presence = usePresenceClock(hospital.presence, hospital.observed_at);
  const presenceLabel = error ? "Unavailable" : presence.status === "online" ? "Online" : presence.status === "idle" ? "Idle" : "Offline";
  return <>
    <header className="o-profile-hero">
      <Image className="o-profile-hero-image" src={PROFILE_HEADER} alt="" fill sizes="(max-width: 600px) 100vw, 960px" preload />
      <div className="o-profile-portrait"><CaptainPortrait sizes="(max-width: 600px) 104px, 152px" /></div>
      <div className="o-profile-heading">
        <h1 aria-label={profile.display_name + " [" + profile.player_number + "]"}>
          <span className="o-profile-name">{profile.display_name}</span> <span className="o-profile-number">[<output aria-label="Player ID">{profile.player_number}</output>]</span>
        </h1>
        <p className="o-profile-status">
          <span className="o-player-presence o-profile-presence" data-presence={error ? "unknown" : presence.status}>
            <span className="o-presence-dot" role="img" aria-label={"Player status: " + presenceLabel} /><span aria-hidden="true">{error ? "Status unavailable" : presenceLabel}</span>
          </span>
          <span>{inHospital ? <HeartPulse aria-hidden="true" /> : <MapPin aria-hidden="true" />}{location}</span>
          {hospital.hospital_until && <span title="Time remaining in hospital"><Timer aria-hidden="true" /><HospitalCountdown until={hospital.hospital_until} observedAt={hospital.observed_at} /></span>}
        </p>
      </div>
      <dl className="o-profile-stats">
        <div><dt>Level</dt><dd><output aria-label="Character Level">{hospital.character_level}</output></dd></div>
        <div><dt>Character age</dt><dd>{ageDays === 0 ? "< 1" : ageDays} <small>{ageDays > 1 ? "days" : "day"}</small></dd></div>
        <div><dt>Max sea distance</dt><dd><output aria-label="Max sea distance">{hospital.max_sea_distance}</output></dd></div>
      </dl>
      {!ownProfile && <div className="o-profile-actions">
        <Link className="o-training-button" href={"/messages/compose?to=" + profile.player_number} prefetch={false}><Mail aria-hidden="true" />Send message</Link>
        {attackBlocked ? <button className="o-training-button" disabled><Swords aria-hidden="true" />Attack</button> :
          <Link className="o-training-button" href={"/attack/" + profile.player_number} prefetch={false}><Swords aria-hidden="true" />Attack</Link>}
      </div>}
    </header>
    {error && <p className="o-feedback" role="status">Character status could not be refreshed. <button className="o-text-button" onClick={() => setAttempt(a => a + 1)}>Retry status</button></p>}
    <div className="o-profile-grid">
      <div className="o-profile-column">
        <section className="o-profile-card" aria-labelledby="profile-details-title">
          <header className="o-profile-card-head"><h2 id="profile-details-title"><ScrollText aria-hidden="true" />Details</h2></header>
          <dl className="o-profile-details">
            <div><dt>Last action</dt><dd>
              <span aria-label="Last action" title={hospital.presence.last_action_at ? new Date(hospital.presence.last_action_at).toUTCString() : undefined}>
                {presence.lastAction}{error && " (last known)"}
              </span>
            </dd></div>
            <div><dt>At sea since</dt><dd><time dateTime={profile.created_at}>{joined}</time></dd></div>
            <div><dt>Forum posts</dt><dd><Link href={forumSearchUrl("by:" + profile.player_number)} prefetch={false} aria-label={"Forum posts: " + forum.post_count}>{forum.post_count.toLocaleString("en-GB")}</Link>
              {forum.thread_count > 0 && <> (<Link href={forumSearchUrl("by:" + profile.player_number, { threads: true })} prefetch={false}>{forum.thread_count} {forum.thread_count === 1 ? "thread" : "threads"}</Link>)</>}</dd></div>
            <div><dt>Forum karma</dt><dd><output aria-label="Forum karma">{forum.karma.toLocaleString("en-GB")}</output></dd></div>
          </dl>
        </section>
        {defence}
      </div>
      {skills}
    </div>
  </>;
}
