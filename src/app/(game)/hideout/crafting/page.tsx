import { Hammer, Package } from "lucide-react";
import { GameLink as Link } from "@/components/game-navigation";
import { Panel } from "@/components/shell";
import { CraftingPanel } from "@/components/crafting-panel";
import { requireCharacter } from "@/lib/player";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Crafting" };

export default async function CraftingPage() {
  await requireCharacter();
  const client = await createClient();
  const { data, error } = await client.rpc("list_crafting_recipes");
  if (error || !data) throw new Error("Crafting recipes could not be loaded.");
  return <>
    <nav className="o-breadcrumb" aria-label="Breadcrumb"><Link href="/harbor">The Harbor</Link><span aria-hidden="true">/</span>
      <Link href="/hideout">Hideout</Link><span aria-hidden="true">/</span><span>Crafting</span></nav>
    <Panel title="Crafting" detail="Hideout workshop" icon={Hammer}>
      <CraftingPanel recipes={data} />
      <div className="o-panel-foot o-hideout-links"><Link href="/inventory"><Package aria-hidden="true" />View your inventory</Link></div>
    </Panel>
  </>;
}
