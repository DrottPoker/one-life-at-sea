import { requireCharacter } from "@/lib/player";
import { ShipUpgradePanel } from "@/components/training/ship-upgrade-panel";

export const metadata = { title: "Ship Upgrades" };

export default async function ShipUpgradesPage() {
  await requireCharacter();
  return <>
    <ShipUpgradePanel />
  </>;
}
