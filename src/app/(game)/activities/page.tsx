import { Compass } from "lucide-react";
import { Panel } from "@/components/shell";
import { PageHero, PLACEHOLDER_HERO } from "@/components/page-hero";
import { ActivitiesPanel } from "@/components/activities-panel";
import { requireCharacter } from "@/lib/player";
import { ownSkillProgress } from "@/lib/skills-server";

export const metadata = { title: "Activities" };

export default async function ActivitiesPage() {
  await requireCharacter();
  const progress = await ownSkillProgress();
  return <>
    <PageHero title="Activities" lead="Practice your skills around the harbor." image={PLACEHOLDER_HERO} icon={Compass} />
    <Panel>
      <ActivitiesPanel progress={progress} />
    </Panel>
  </>;
}
