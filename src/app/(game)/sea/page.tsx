import { redirect } from "next/navigation";
import { SeaScouting } from "@/components/sea-scouting";
import { SeaTravelPanel } from "@/components/sea-travel-panel";
import { requireCharacter, gameStateForPlayer } from "@/lib/player";

export const metadata = { title: "At Sea" };

export default async function SeaPage() {
  await requireCharacter({ allowSea: true });
  const state = await gameStateForPlayer();
  if (state.sea.state === "in_harbor") redirect("/harbor");
  return <>
    <SeaTravelPanel />
    <SeaScouting />
  </>;
}
