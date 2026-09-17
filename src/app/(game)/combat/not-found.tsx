import Link from "next/link";
import { Panel } from "@/components/shell";

export default function CombatNotFound() {
  return <Panel title="Encounter not found"><div className="o-panel-body">
    <p>This captain or encounter is unavailable. Combat reports are visible only to their participants.</p>
    <Link href="/harbor">Back to The Harbor</Link>
  </div></Panel>;
}
