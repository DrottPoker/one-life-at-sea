"use client";

import Link from "next/link";
import { Panel } from "@/components/shell";

export default function ProfileError({ reset }: { reset: () => void }) {
  return <Panel title="Profile unavailable"><div className="o-panel-body">
    <p>We could not load this profile. Please try again.</p>
    <div className="o-form-actions">
      <button type="button" className="o-primary" onClick={reset}>Try again</button>
      <Link href="/harbor">Back to The Harbor</Link>
    </div>
  </div></Panel>;
}
