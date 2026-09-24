import { gameplay, durationLabel } from "@/config/public";
import { requireCharacter } from "@/lib/player";
import { createClient } from "@/lib/supabase/server";
import { HospitalPanel } from "@/components/hospital-panel";
import { HeartPulse } from "lucide-react";
import { Panel } from "@/components/shell";
import { PageHero, PLACEHOLDER_HERO } from "@/components/page-hero";

export const metadata = { title: "Hospital" };

export default async function HospitalPage() {
  const character = await requireCharacter({ allowHospital: true });
  const client = await createClient();
  const { data } = await client.rpc("list_hospital_patients", { requested_page: 0 });
  return <>
    <PageHero title="Hospital" lead={"Rest and recover. Treatment takes " + durationLabel(gameplay.hospital.durationSeconds) + "."} image={PLACEHOLDER_HERO} icon={HeartPulse} />
    <Panel>
      <HospitalPanel initial={data} characterId={character.id} />
    </Panel>
  </>;
}
