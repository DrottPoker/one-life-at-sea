import Link from "next/link";
export default function NotFound() {
  return <main id="main" className="o-panel-body"><h1>Combat log unavailable</h1>
    <p>This encounter has not ended, or the link is unavailable.</p><Link href="/harbor">Back to The Harbor</Link></main>;
}
