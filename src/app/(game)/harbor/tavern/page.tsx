import { TavernPanel } from "@/components/tavern-panel";
import { Panel } from "@/components/shell";

export const metadata = { title: "Tavern" };

export default function TavernPage() {
  return <>
    <nav className="o-breadcrumb" aria-label="Breadcrumb"><span>The Harbor</span><span aria-hidden="true">/</span><span>Tavern</span></nav>
    <Panel title="Tavern" detail="Crew meals"><TavernPanel /></Panel>
  </>;
}
