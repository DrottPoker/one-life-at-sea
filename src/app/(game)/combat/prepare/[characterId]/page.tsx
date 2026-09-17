import { redirect } from "next/navigation";
export default async function LegacyPreparation({ params }: { params: Promise<{ characterId: string }> }) {
  const { characterId } = await params;
  redirect("/attack/" + encodeURIComponent(characterId));
}
