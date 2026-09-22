import "server-only";
import { cache } from "react";
import { playerContext } from "@/lib/player-context";
import expected from "./gameplay-revision.json";

// Request-scoped; a deployment mismatch must never silently change the UI rules.
export const assertGameplayRevision = cache(async () => {
  const context = await playerContext();
  if (context.config_revision !== expected.revision) {
    throw new Error("Gameplay configuration does not match the database. Run config:sync and apply its migration before serving this app.");
  }
});
