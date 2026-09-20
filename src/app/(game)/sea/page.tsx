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
    <nav className="o-breadcrumb" aria-label="Breadcrumb"><span>At Sea</span><span aria-hidden="true">/</span><span>{state.sea.state === "traveling" ? "Traveling" : "Sea distance " + state.sea.step}</span></nav>
    <SeaTravelPanel />
    <SeaScouting />
  </>;
}
