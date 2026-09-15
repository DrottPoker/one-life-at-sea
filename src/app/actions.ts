"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser, characterForUser } from "@/lib/player";
import { siteUrl } from "@/lib/env";
import { normalizeCharacterName, validateCharacterName, validateEmail, validatePassword, type FormState } from "@/lib/validation";

const value = (data: FormData, key: string) => typeof data.get(key) === "string" ? String(data.get(key)) : "";

function authMessage(code?: string) {
  if (code === "over_request_rate_limit" || code === "over_email_send_rate_limit") return "Too many attempts. Please wait a minute and try again.";
  if (code === "weak_password") return "Choose a stronger password with at least 12 characters.";
  if (code === "email_address_not_authorized") return "Email delivery is not ready for this address. Please contact the game owner.";
  return "We could not complete your request. Please try again.";
}

export async function register(_previous: FormState, data: FormData): Promise<FormState> {
  const email = value(data, "email").trim();
  const password = value(data, "password");
  const name = normalizeCharacterName(value(data, "name"));
  const errors = validatePassword(password, value(data, "confirmPassword"));
  const emailError = validateEmail(email);
  const nameError = validateCharacterName(name);
  if (emailError) errors.email = emailError;
  if (nameError) errors.name = nameError;
  if (Object.keys(errors).length) return { errors, email, name };
  const supabase = await createClient();
  const taken = { errors: { name: "That name is already taken. Choose another name." }, email, name };
  const availability = await supabase.rpc("is_character_name_available", { candidate: name });
  if (availability.error) return { message: "Registration is temporarily unavailable. Please try again.", email, name };
  if (!availability.data) return taken;
  const { data: authData, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { character_name: name }, emailRedirectTo: `${siteUrl()}/auth/callback` },
  });
  if (error) {
    // A simultaneous signup can claim the name after the availability check.
    const current = await supabase.rpc("is_character_name_available", { candidate: name });
    if (!current.error && !current.data) return taken;
    return { message: error.code === "user_already_exists" ? "An account already exists for this email. Please log in." : authMessage(error.code), email, name };
  }
  if (!authData.session) return { message: "Registration is not ready yet. Please contact the game owner.", email, name };
  redirect("/harbor");
}

export async function logIn(_previous: FormState, data: FormData): Promise<FormState> {
  const email = value(data, "email").trim();
  const password = value(data, "password");
  if (validateEmail(email) || !password || password.length > 128) return { message: "Enter your email address and password.", email };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { message: error.code === "invalid_credentials" ? "The email or password is incorrect." : authMessage(error.code), email };
  redirect("/");
}

export async function logOut() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) throw new Error("You could not be logged out. Please try again.");
  redirect("/login");
}

export async function sendReset(_previous: FormState, data: FormData): Promise<FormState> {
  const email = value(data, "email").trim();
  const emailError = validateEmail(email);
  if (emailError) return { errors: { email: emailError }, email };
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${siteUrl()}/auth/callback?next=/reset-password` });
  if (error?.code === "over_request_rate_limit" || error?.code === "over_email_send_rate_limit") return { message: authMessage(error.code), email, retryAfter: 60 };
  if (error && error.status && error.status >= 500) return { message: authMessage(), email };
  return { success: true, email, retryAfter: 60, message: "If an account exists for this address, a password reset link will arrive shortly. Check your inbox and spam folder." };
}

export async function changePassword(_previous: FormState, data: FormData): Promise<FormState> {
  await requireUser();
  const password = value(data, "password");
  const errors = validatePassword(password, value(data, "confirmPassword"));
  if (Object.keys(errors).length) return { errors };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { message: error.code === "same_password" ? "Choose a password you have not used before." : authMessage(error.code) };
  const { error: signOutError } = await supabase.auth.signOut({ scope: "global" });
  if (signOutError) return { success: true, message: "Your password has changed. Please log out and sign in again." };
  redirect("/login?notice=password-updated");
}

export async function createCharacter(_previous: FormState, data: FormData): Promise<FormState> {
  const user = await requireUser();
  if (await characterForUser(user.id)) redirect("/harbor");
  const name = normalizeCharacterName(value(data, "name"));
  const nameError = validateCharacterName(name);
  if (nameError) return { name, errors: { name: nameError } };
  const supabase = await createClient();
  const { error } = await supabase.from("characters").insert({ display_name: name });
  if (error) {
    if (error.code === "23505") {
      const { data: existing } = await supabase.from("characters").select("id").eq("user_id", user.id).maybeSingle();
      if (existing) redirect("/harbor");
      return { name, errors: { name: "That name is already taken. Choose another name." } };
    }
    return { name, message: "Your character could not be saved. Please try again." };
  }
  redirect("/harbor");
}
