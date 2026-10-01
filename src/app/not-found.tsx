import Link from "next/link";
import { Panel } from "@/components/shell";

export default function NotFound() {
  return <main id="main" className="o-public-space"><Panel title="Uncharted waters"><div className="o-panel-body"><p>This place is not on the map.</p><Link href="/">Back to The Harbor</Link></div></Panel></main>;
}
