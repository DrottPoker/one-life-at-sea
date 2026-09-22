import { notFound, redirect } from "next/navigation";
import { requireCharacter } from "@/lib/player";
import { isPlayerNumber } from "@/lib/player-identity";

export default async function LegacyMessagePage({ params }: { params: Promise<{ playerNumber: string }> }) {
  await requireCharacter({ allowHospital: true, allowSea: true });
  const { playerNumber } = await params;
  if (!isPlayerNumber(playerNumber)) notFound();
  redirect("/messages/compose?to=" + playerNumber);
}
