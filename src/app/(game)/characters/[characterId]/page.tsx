import { notFound, permanentRedirect } from "next/navigation";
import { requireCharacter } from "@/lib/player";
import { findPlayerProfile } from "@/lib/player-profile";
import { playerProfileUrl } from "@/lib/player-identity";
import { isUuid } from "@/lib/validation";

export default async function LegacyCharacterProfile({ params }: { params: Promise<{ characterId: string }> }) {
  await requireCharacter({ allowHospital: true, allowSea: true });
  const { characterId } = await params;
  if (!isUuid(characterId)) notFound();
  const profile = await findPlayerProfile(characterId);
  if (!profile) notFound();
  permanentRedirect(playerProfileUrl(profile.player_number));
}
