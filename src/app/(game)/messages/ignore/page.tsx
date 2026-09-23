import { MailIgnoreList } from "@/components/messages/mail-ignore-list";
import { requireCharacter } from "@/lib/player";
import { createClient } from "@/lib/supabase/server";

export default async function IgnorePage() {
  const character = await requireCharacter({ allowHospital: true, allowSea: true });
  const client = await createClient();
  const { data, error } = await client.rpc("get_mail_ignored");
  if (error || !data) throw new Error("Your ignore list could not be loaded. Please try again.");
  return <MailIgnoreList characterId={character.id} playerNumber={character.player_number} people={data} />;
}
