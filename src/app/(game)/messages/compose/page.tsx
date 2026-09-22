import { MailComposer } from "@/components/mail-composer";
import { requireCharacter } from "@/lib/player";
import { createClient } from "@/lib/supabase/server";
import { isPlayerNumber } from "@/lib/player-identity";
import type { MailPerson } from "@/lib/messages";

export default async function ComposePage({ searchParams }: { searchParams: Promise<{ to?: string }> }) {
  const character = await requireCharacter({ allowHospital: true, allowSea: true });
  const { to } = await searchParams;
  let recipients: MailPerson[] = [];
  if (isPlayerNumber(to) && Number(to) !== character.player_number) {
    const client = await createClient();
    const { data, error } = await client.rpc("search_players", { search_term: "#" + to });
    if (error) throw new Error("The recipient could not be loaded. Please try again.");
    recipients = data?.players.filter(person => person.player_number === Number(to)) ?? [];
  }
  return <MailComposer key={character.id + ":" + (to || "")} characterId={character.id} playerNumber={character.player_number} initialRecipients={recipients} />;
}
