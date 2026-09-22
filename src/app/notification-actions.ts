"use server";

import { revalidatePath } from "next/cache";
import { requireCharacter } from "@/lib/player";
import { createClient } from "@/lib/supabase/server";
import { isNotificationId } from "@/lib/notifications";
import { withDatabaseRetry } from "@/lib/database-retry";

export async function markNotificationsRead(characterId: string, id: string, all = false): Promise<string | null> {
  const character = await requireCharacter({ allowHospital: true, allowSea: true });
  if (character.id !== characterId) return "Your signed-in character changed. Reload Notifications.";
  if (!isNotificationId(id) || typeof all !== "boolean") return "Reload Notifications and try again.";
  const client = await createClient();
  const { error } = await withDatabaseRetry(() => all
    ? client.rpc("mark_all_notifications_read", { through_id: id })
    : client.rpc("mark_notification_read", { notification_id: id }));
  if (error) return "Notifications could not be marked as read. Please try again.";
  revalidatePath("/", "layout");
  return null;
}
