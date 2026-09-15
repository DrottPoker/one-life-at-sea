import Link from "next/link";
import { Panel } from "@/components/shell";

export const metadata = { title: "Check your account link" };

export default function LinkError() {
  return <main id="main" className="o-public-space"><Panel title="We could not finish that link" className="o-confirm"><div className="o-panel-body">
    <h2 className="story-heading">Let us get you back on course.</h2><p>The link may have expired, already been used, or opened in another browser.</p>
    <p className="o-copy">Open a password reset link in the same browser where you requested it, or request a new link.</p>
    <div className="flex flex-wrap gap-4 mt-4"><Link href="/login">Log in</Link><Link href="/forgot-password">Reset password</Link></div>
  </div></Panel></main>;
}
