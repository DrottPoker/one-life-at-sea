import { redirect } from "next/navigation";
import { AuthFrame, Panel, Unconfigured } from "@/components/shell";
import { AuthForm } from "@/components/auth-form";
import { currentUser } from "@/lib/player";
import { getSupabaseConfig } from "@/lib/env";

export const metadata = { title: "Create account" };

export default async function Register() {
  if (!getSupabaseConfig()) return <Unconfigured />;
  if (await currentUser()) redirect("/");
  return <AuthFrame><Panel title="Create account"><AuthForm mode="register" /></Panel></AuthFrame>;
}
