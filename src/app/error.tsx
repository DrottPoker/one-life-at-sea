"use client";

import Link from "next/link";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main id="main" className="o-public-space"><section className="o-panel"><div className="o-panel-title"><h1>A rough patch of water</h1></div>
    <div className="o-panel-body"><p>We could not load the game. Your saved progress is safe. Please try again.</p><div className="flex gap-4 items-center mt-4">
      <button className="o-primary" onClick={reset}>Try again</button><Link href="/">Return to the harbor</Link></div></div></section></main>;
}
