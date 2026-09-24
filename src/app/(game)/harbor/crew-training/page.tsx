import { requireCharacter } from "@/lib/player";
import { CrewTrainingPanel } from "@/components/training/crew-training-panel";

export const metadata = { title: "Crew Training" };

export default async function TrainingPage() {
  await requireCharacter();
  return <>
    <CrewTrainingPanel />
  </>;
}
