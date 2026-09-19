import { gameplay, durationLabel } from "@/config/public";
import { requireCharacter } from "@/lib/player";
import { createClient } from "@/lib/supabase/server";
import { HospitalPanel } from "@/components/hospital-panel";
import { Panel } from "@/components/shell";

export const metadata = { title: "Hospital" };

export default async function HospitalPage() {
  const character = await requireCharacter({ allowHospital: true });
  const client = await createClient();
  const { data } = await client.rpc("list_hospital_patients", { requested_page: 0 });
  return <>
    <nav className="o-breadcrumb" aria-label="Breadcrumb"><span>The Harbor</span><span aria-hidden="true">/</span><span>Hospital</span></nav>
    <Panel title="Hospital" detail={durationLabel(gameplay.hospital.durationSeconds) + " recovery"}>
      <HospitalPanel initial={data} characterId={character.id} />
    </Panel>
  </>;
}
