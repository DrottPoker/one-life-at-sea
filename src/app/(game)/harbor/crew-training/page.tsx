import Link from "next/link";
import { requireCharacter } from "@/lib/player";
import { Panel } from "@/components/shell";
import { TrainingPanel } from "@/components/training-panel";

export const metadata = { title: "Crew Training" };

export default async function TrainingPage() {
  await requireCharacter();
  return <>
    <nav className="o-breadcrumb" aria-label="Breadcrumb"><Link href="/harbor">The Harbor</Link><span aria-hidden="true">/</span><span>Crew Training</span></nav>
    <Panel title="Crew Training" detail="5 Energy / +1 stat"><TrainingPanel group="crew" /></Panel>
  </>;
}
