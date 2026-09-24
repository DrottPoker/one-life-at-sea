import { TavernPanel } from "@/components/tavern-panel";
import { Utensils } from "lucide-react";
import { Panel } from "@/components/shell";
import { PageHero, PLACEHOLDER_HERO } from "@/components/page-hero";

export const metadata = { title: "Tavern" };

export default function TavernPage() {
  return <>
    <PageHero title="Tavern" lead="Hearty meals to lift your crew's spirits." image={PLACEHOLDER_HERO} icon={Utensils} />
    <Panel><TavernPanel /></Panel>
  </>;
}
