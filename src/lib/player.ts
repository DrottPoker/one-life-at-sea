import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseConfig } from "@/lib/env";

export const currentUser = cache(async () => {
  if (!getSupabaseConfig()) return null;
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user || user.is_anonymous) return null;
  return user;
});

export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

export const characterForUser = cache(async (userId: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("characters").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw new Error("Your character could not be loaded. Please try again.");
  return data;
});

export async function requireCharacter() {
  const user = await requireUser();
  const character = await characterForUser(user.id);
  if (!character) redirect("/create-character");
  return character;
}
