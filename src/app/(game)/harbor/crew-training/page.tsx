import { GameLink as Link } from "@/components/game-navigation";
import { requireCharacter } from "@/lib/player";
import { Panel } from "@/components/shell";
import { CrewTrainingPanel } from "@/components/crew-training-panel";

export const metadata = { title: "Crew Training" };

export default async function TrainingPage() {
  await requireCharacter();
  return <>
    <nav className="o-breadcrumb" aria-label="Breadcrumb"><Link href="/harbor">The Harbor</Link><span aria-hidden="true">/</span><span>Crew Training</span></nav>
    <Panel title="Crew Training" detail="Immediate drills · Perfect Drill chance"><CrewTrainingPanel /></Panel>
  </>;
}
