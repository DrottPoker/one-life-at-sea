import { GameLink as Link } from "@/components/game-navigation";
import { requireCharacter } from "@/lib/player";
import { Panel } from "@/components/shell";
import { ShipUpgradePanel } from "@/components/training/ship-upgrade-panel";

export const metadata = { title: "Ship Upgrades" };

export default async function TrainingPage() {
  await requireCharacter();
  return <>
    <nav className="o-breadcrumb" aria-label="Breadcrumb"><Link href="/harbor">The Harbor</Link><span aria-hidden="true">/</span><span>Ship Upgrades</span></nav>
    <Panel title="Ship Upgrades" detail="Timed work · Offline progress"><ShipUpgradePanel /></Panel>
  </>;
}
