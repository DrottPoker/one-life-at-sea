"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CombatArena } from "@/components/combat/combat-arena";
import { CombatHeading } from "@/components/combat/combat-heading";
import { CombatPreparation } from "@/components/combat/combat-preparation";
import type { Battle, CombatPreview } from "@/lib/combat";
import type { SkillProgress } from "@/lib/skills";

export function AttackSession({ battle, preview, skills, heading, hospital = false }: {
  battle: Battle | null; preview: CombatPreview | null; skills: SkillProgress | null; hospital?: boolean;
  heading: { energy: number; backUrl: string; backLabel: string; canLeave: boolean };
}) {
  const router = useRouter();
  const [encounterId, setEncounterId] = useState(battle?.status === "active" ? battle.id : null);
  // Remember this visit's encounter while the shared target URL stays unchanged.
  if (battle?.status === "active" && encounterId !== battle.id) setEncounterId(battle.id);
  // A fight that ended during this visit keeps its arena, whose scene plays the final round and offers Leave to the log.
  const report = battle?.status === "completed" && battle.id === encounterId ? battle : null;
  const arena = battle?.status === "active" ? battle : report;
  // In hospital the page only exists to finish a fight watched during this visit.
  const toHospital = hospital && !report;

  useEffect(() => {
    if (toHospital) router.replace("/harbor/hospital");
  }, [toHospital, router]);

  if (toHospital) return <p className="o-panel-body" role="status"><span className="o-spinner" aria-hidden="true" /> Returning to hospital...</p>;
  return <>
    <CombatHeading battle={battle} finished={!!report} skills={skills} {...heading} />
    {arena ? <CombatArena battle={arena} skills={skills} key={arena.id} /> : preview && <CombatPreparation preview={preview} />}
  </>;
}
