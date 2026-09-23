import { notFound } from "next/navigation";
import { MailWorkspace } from "@/components/mail-workspace";
import { requireCharacter } from "@/lib/player";
import { isMessageId, type MailViewParams } from "@/lib/messages";

export default async function MailPage({ params, searchParams }: { params: Promise<{ mailId: string }>; searchParams: Promise<MailViewParams> }) {
  const character = await requireCharacter({ allowHospital: true, allowSea: true });
  const [{ mailId }, view] = await Promise.all([params, searchParams]);
  if (!isMessageId(mailId)) notFound();
  return <MailWorkspace characterId={character.id} playerNumber={character.player_number} params={view} mailId={mailId} />;
}
