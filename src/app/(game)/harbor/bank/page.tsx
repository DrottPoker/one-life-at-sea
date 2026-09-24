import { BankPanel } from "@/components/bank-panel";
import { Landmark } from "lucide-react";
import { Panel } from "@/components/shell";
import { PageHero, PLACEHOLDER_HERO } from "@/components/page-hero";

export const metadata = { title: "Bank" };

export default function BankPage() {
  return <>
    <PageHero title="Bank" lead="Store your Gold Coins safely ashore." image={PLACEHOLDER_HERO} icon={Landmark} />
    <Panel><BankPanel /></Panel>
  </>;
}
