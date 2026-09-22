import { notFound } from "next/navigation";
import { MailReader } from "@/components/mail-reader";
import { requireCharacter } from "@/lib/player";
import { createClient } from "@/lib/supabase/server";
import { isMessageId } from "@/lib/messages";

export default async function MailPage({ params, searchParams }: { params: Promise<{ mailId: string }>; searchParams: Promise<{ history?: string }> }) {
  const character = await requireCharacter({ allowHospital: true, allowSea: true });
  const [{ mailId }, { history }] = await Promise.all([params, searchParams]);
  if (!isMessageId(mailId)) notFound();
  const client = await createClient();
  const { data, error } = await client.rpc("get_mail", { mail_id: mailId, include_history: history === "1" });
  if (error?.message === "MAIL_NOT_FOUND" || (!error && !data)) notFound();
  if (error || !data) throw new Error("This mail could not be loaded. Please try again.");
  return <MailReader key={character.id + ":" + mailId} characterId={character.id} playerNumber={character.player_number} mail={data} showHistory={history === "1"} />;
}
