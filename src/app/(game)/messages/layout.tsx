import { Mail } from "lucide-react";
import { Panel } from "@/components/shell";
import { MailNav } from "@/components/mail-nav";
import { requireCharacter } from "@/lib/player";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Messages" };
export default async function MessagesLayout({ children }: { children: React.ReactNode }) {
  await requireCharacter({ allowHospital: true, allowSea: true });
  const client = await createClient();
  const { data, error } = await client.rpc("get_mail_summary");
  if (error || !data) throw new Error("Messages could not be loaded. Please try again.");
  return <Panel title="Messages" icon={Mail}><MailNav summary={data} />{children}</Panel>;
}
