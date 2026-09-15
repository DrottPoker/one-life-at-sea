import "server-only";

export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || key.startsWith("replace-")) return null;
  return { url, key };
}

export function siteUrl() {
  const value = process.env.SITE_URL;
  if (!value) throw new Error("SITE_URL must be configured.");
  return new URL(value).origin;
}
