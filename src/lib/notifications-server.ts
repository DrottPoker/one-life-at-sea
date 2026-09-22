import "server-only";
import { cache } from "react";
import { playerSnapshot } from "@/lib/player-context";
import { requireUser } from "@/lib/player";

export const notificationSummaryForPlayer = cache(async () => {
  await requireUser();
  return (await playerSnapshot()).notifications;
});
