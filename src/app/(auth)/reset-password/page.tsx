import Link from "next/link";
import { Panel } from "@/components/shell";
import { AuthForm } from "@/components/auth-form";
import { currentUser } from "@/lib/player";

export const metadata = { title: "Choose a new password" };

export default async function ResetPassword() {
  const user = await currentUser();
  return <Panel title="Choose a new password" className="o-confirm">{user ? <AuthForm mode="reset" /> : <div className="o-panel-body">
    <p>Your reset link is missing or has expired. Request a new link and open it in the browser where you requested it.</p><Link href="/forgot-password">Request a new reset link</Link>
  </div>}</Panel>;
}
