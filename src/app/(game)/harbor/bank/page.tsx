import { BankPanel } from "@/components/bank-panel";
import { Panel } from "@/components/shell";

export const metadata = { title: "Bank" };

export default function BankPage() {
  return <>
    <Panel title="Bank" detail="Gold Coins"><BankPanel /></Panel>
  </>;
}
