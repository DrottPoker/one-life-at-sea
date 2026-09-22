import "server-only";
import { cache } from "react";
import { assertGameplayRevision } from "@/config/revision";
import { playerSnapshot } from "@/lib/player-context";
import { requireUser } from "@/lib/player";

export const ownSkillProgress = cache(async () => {
  await Promise.all([requireUser(), assertGameplayRevision()]);
  return (await playerSnapshot()).skills;
});
