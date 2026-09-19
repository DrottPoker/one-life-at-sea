import { BankPanel } from "@/components/bank-panel";
import { Panel } from "@/components/shell";

export const metadata = { title: "Bank" };

export default function BankPage() {
  return <>
    <nav className="o-breadcrumb" aria-label="Breadcrumb"><span>The Harbor</span><span aria-hidden="true">/</span><span>Bank</span></nav>
    <Panel title="Bank" detail="Gold Coins"><BankPanel /></Panel>
  </>;
}
