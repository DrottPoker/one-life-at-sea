import Link from "next/link";
import { Panel } from "@/components/shell";

export default function ProfileNotFound() {
  return <Panel title="Character not found"><div className="o-panel-body">
    <p>This captain could not be found.</p>
    <Link href="/harbor">Back to The Harbor</Link>
  </div></Panel>;
}
