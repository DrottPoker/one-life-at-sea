"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CombatArena } from "@/components/combat/combat-arena";
import { CombatPreparation } from "@/components/combat/combat-preparation";
import type { Battle, CombatPreview } from "@/lib/combat";

export function AttackSession({ battle, preview }: { battle: Battle | null; preview: CombatPreview | null }) {
  const router = useRouter();
  const [encounterId, setEncounterId] = useState(battle?.status === "active" ? battle.id : null);
  // Remember this visit's encounter while the shared target URL stays unchanged.
  if (battle?.status === "active" && encounterId !== battle.id) setEncounterId(battle.id);
  const reportId = battle?.status === "completed" && battle.id === encounterId ? battle.id : null;

  useEffect(() => {
    if (reportId) router.replace("/combatlog/" + reportId);
  }, [reportId, router]);

  if (reportId) return <p className="o-panel-body" role="status">
    <span className="o-spinner" aria-hidden="true" /> Opening combat log... <Link href={"/combatlog/" + reportId}>View report</Link>
  </p>;
  if (battle?.status === "active") return <CombatArena battle={battle} key={battle.id} />;
  return preview && <CombatPreparation preview={preview} />;
}
