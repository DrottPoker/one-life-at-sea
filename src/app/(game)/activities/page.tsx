import { Compass } from "lucide-react";
import { Panel } from "@/components/shell";
import { ActivitiesPanel } from "@/components/activities-panel";
import { requireCharacter } from "@/lib/player";
import { ownSkillProgress } from "@/lib/skills-server";

export const metadata = { title: "Activities" };

export default async function ActivitiesPage() {
  await requireCharacter();
  const progress = await ownSkillProgress();
  return <>
    <Panel title="Activities" detail="Practice your skills" icon={Compass}>
      <ActivitiesPanel progress={progress} />
    </Panel>
  </>;
}
