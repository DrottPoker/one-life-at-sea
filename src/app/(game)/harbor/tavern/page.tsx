import { TavernPanel } from "@/components/tavern-panel";
import { Panel } from "@/components/shell";

export const metadata = { title: "Tavern" };

export default function TavernPage() {
  return <>
    <Panel title="Tavern" detail="Crew meals"><TavernPanel /></Panel>
  </>;
}
