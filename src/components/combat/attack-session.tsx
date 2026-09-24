"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CombatArena } from "@/components/combat/combat-arena";
import { CombatHeading } from "@/components/combat/combat-heading";
import { CombatPreparation } from "@/components/combat/combat-preparation";
import type { Battle, CombatPreview } from "@/lib/combat";
import { latestOwnRound, roundStrikes, sceneDuration } from "@/lib/combat-scene";

// The pause after the final round's animation before the combat log opens.
const REPORT_DELAY = 500;
const ownRound = (battle: Battle | null) => battle?.status === "active" ? latestOwnRound(battle.events, battle.attacker.id)?.sequence ?? 0 : 0;

export function AttackSession({ battle, preview, heading, hospital = false }: {
  battle: Battle | null; preview: CombatPreview | null; hospital?: boolean;
  heading: { energy: number; backUrl: string; backLabel: string; canLeave: boolean };
}) {
  const router = useRouter();
  const [encounterId, setEncounterId] = useState(battle?.status === "active" ? battle.id : null);
  const [seenRound, setSeenRound] = useState(() => ownRound(battle));
  // Remember this visit's encounter and latest own round while the shared target URL stays unchanged.
  if (battle?.status === "active" && encounterId !== battle.id) setEncounterId(battle.id);
  if (battle?.status === "active" && ownRound(battle) !== seenRound) setSeenRound(ownRound(battle));
  const report = battle?.status === "completed" && battle.id === encounterId ? battle : null;
  // A round that ended the encounter during this visit plays out on the scene before the log opens.
  const finalRound = report ? latestOwnRound(report.events, report.attacker.id) : null;
  const wait = REPORT_DELAY + (finalRound && finalRound.sequence > seenRound ? sceneDuration(roundStrikes(finalRound)) : 0);
  const reportId = report?.id ?? null, arena = battle?.status === "active" ? battle : report;
  // In hospital the page only exists to finish a fight watched during this visit.
  const toHospital = hospital && !reportId;

  useEffect(() => {
    if (toHospital) router.replace("/harbor/hospital");
    if (!reportId) return;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = setTimeout(() => router.replace("/combatlog/" + reportId), still ? REPORT_DELAY : wait);
    return () => clearTimeout(timer);
  }, [reportId, wait, router, toHospital]);

  if (toHospital) return <p className="o-panel-body" role="status"><span className="o-spinner" aria-hidden="true" /> Returning to hospital...</p>;
  return <>
    <CombatHeading battle={battle} finished={!!report} {...heading} />
    {arena ? <CombatArena battle={arena} key={arena.id} /> : preview && <CombatPreparation preview={preview} />}
  </>;
}
