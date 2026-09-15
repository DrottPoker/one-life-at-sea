import { redirect } from "next/navigation";
import { AuthFrame, Panel, Unconfigured } from "@/components/shell";
import { AuthForm } from "@/components/auth-form";
import { currentUser } from "@/lib/player";
import { getSupabaseConfig } from "@/lib/env";

export const metadata = { title: "Log in" };

export default async function Login({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  if (!getSupabaseConfig()) return <Unconfigured />;
  if (await currentUser()) redirect("/");
  const { notice } = await searchParams;
  return <AuthFrame><Panel title="Log in">
    {notice === "password-updated" && <p className="o-notice m-4" role="status">Your password has changed. Log in with your new password.</p>}
    <AuthForm mode="login" />
  </Panel></AuthFrame>;
}
