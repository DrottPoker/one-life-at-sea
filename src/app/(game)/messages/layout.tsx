import { Mail } from "lucide-react";
import { MailNav } from "@/components/messages/mail-nav";
import { MailSearch } from "@/components/messages/mail-search";
import { requireCharacter } from "@/lib/player";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Messages" };
export default async function MessagesLayout({ children }: { children: React.ReactNode }) {
  await requireCharacter({ allowHospital: true, allowSea: true });
  const client = await createClient();
  const { data, error } = await client.rpc("get_mail_summary");
  if (error || !data) throw new Error("Messages could not be loaded. Please try again.");
  return <section className="o-panel o-mail-panel">
    <header className="o-mail-heading"><div className="o-mail-heading-title"><Mail aria-hidden="true" />
      <div><h1>Messages</h1><p>Stay in touch across the oceans.</p></div>
    </div><MailSearch /></header>
    <MailNav summary={data} />{children}
  </section>;
}
