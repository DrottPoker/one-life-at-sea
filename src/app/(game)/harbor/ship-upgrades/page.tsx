import { gameplay } from "@/config/public";
import Link from "next/link";
import { requireCharacter } from "@/lib/player";
import { Panel } from "@/components/shell";
import { TrainingPanel } from "@/components/training-panel";

export const metadata = { title: "Ship Upgrades" };

export default async function TrainingPage() {
  await requireCharacter();
  return <>
    <nav className="o-breadcrumb" aria-label="Breadcrumb"><Link href="/harbor">The Harbor</Link><span aria-hidden="true">/</span><span>Ship Upgrades</span></nav>
    <Panel title="Ship Upgrades" detail={`${gameplay.training.energyCost} Energy / +${gameplay.training.statGain} stat`}><TrainingPanel group="ship" /></Panel>
  </>;
}
