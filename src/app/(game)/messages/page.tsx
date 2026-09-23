import { MailWorkspace } from "@/components/messages/mail-workspace";
import { requireCharacter } from "@/lib/player";
import type { MailViewParams } from "@/lib/messages";

export default async function MessagesPage({ searchParams }: { searchParams: Promise<MailViewParams> }) {
  const character = await requireCharacter({ allowHospital: true, allowSea: true });
  return <MailWorkspace characterId={character.id} playerNumber={character.player_number} params={await searchParams} />;
}
