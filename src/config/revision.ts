import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import expected from "./gameplay-revision.json";

// Request-scoped; a deployment mismatch must never silently change the UI rules.
export const assertGameplayRevision = cache(async () => {
  const client = await createClient();
  const { data, error } = await client.rpc("get_gameplay_revision");
  if (error || data !== expected.revision) {
    throw new Error("Gameplay configuration does not match the database. Run config:sync and apply its migration before serving this app.");
  }
});
