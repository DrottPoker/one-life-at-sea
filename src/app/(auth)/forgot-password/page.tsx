import { Panel, Unconfigured } from "@/components/shell";
import { AuthForm } from "@/components/auth-form";
import { getSupabaseConfig } from "@/lib/env";

export const metadata = { title: "Reset password" };

export default function ForgotPassword() {
  if (!getSupabaseConfig()) return <Unconfigured />;
  return <Panel title="Reset password" className="o-confirm"><div className="o-panel-body"><h2 className="story-heading">Find your way back.</h2>
    <p className="o-copy">Enter your email address and we will send you a password reset link.</p></div><AuthForm mode="forgot" /></Panel>;
}
