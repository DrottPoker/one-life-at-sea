import { Bell } from "lucide-react";
import { Panel } from "@/components/shell";
import { NotificationInbox } from "@/components/notification-inbox";
import { requireCharacter } from "@/lib/player";
import { createClient } from "@/lib/supabase/server";
import { isNotificationId } from "@/lib/notifications";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ before?: string | string[] }> }) {
  const character = await requireCharacter({ allowHospital: true, allowSea: true });
  const { before } = await searchParams;
  const cursor = isNotificationId(before) ? before : undefined;
  const client = await createClient();
  const { data, error } = await client.rpc("get_notifications", cursor ? { before_id: cursor } : {});
  if (error || !data) throw new Error("Notifications could not be loaded. Please try again.");
  return <Panel title="Notifications" icon={Bell}><NotificationInbox data={data} characterId={character.id} older={!!cursor} /></Panel>;
}
