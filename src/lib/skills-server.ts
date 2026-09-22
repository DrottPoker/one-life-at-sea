import "server-only";
import { cache } from "react";
import { assertGameplayRevision } from "@/config/revision";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/player";
import { withDatabaseRetry } from "@/lib/database-retry";

export const ownSkillProgress = cache(async () => {
  await Promise.all([requireUser(), assertGameplayRevision()]);
  const client = await createClient();
  const { data, error } = await withDatabaseRetry(() => client.rpc("get_own_skills"));
  if (error || !data) throw new Error("Your skills could not be loaded. Please try again.");
  return data;
});
