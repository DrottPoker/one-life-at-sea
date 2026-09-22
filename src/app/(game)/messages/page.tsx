import { MailList } from "@/components/mail-list";
import { requireCharacter } from "@/lib/player";
import { createClient } from "@/lib/supabase/server";
import type { MailFolder } from "@/lib/messages";

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ folder?: string; q?: string; page?: string }> }) {
  const character = await requireCharacter({ allowHospital: true, allowSea: true });
  const params = await searchParams;
  const folder: MailFolder = params.folder === "outbox" || params.folder === "saved" ? params.folder : "inbox";
  const query = typeof params.q === "string" ? params.q.slice(0, 200) : "";
  const page = typeof params.page === "string" && /^\d{1,7}$/.test(params.page) ? Number(params.page) : 0;
  const client = await createClient();
  const { data, error } = await client.rpc("get_mailbox", { folder, query, page });
  if (error || !data) throw new Error("Your mailbox could not be loaded. Please try again.");
  return <MailList key={folder + ":" + query + ":" + data.page} characterId={character.id} data={data} folder={folder} query={query} />;
}
