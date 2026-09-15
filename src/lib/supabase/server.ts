import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseConfig } from "@/lib/env";
import type { Database } from "@/lib/database.types";

export async function createClient() {
  const config = getSupabaseConfig();
  if (!config) throw new Error("Supabase is not configured.");
  const store = await cookies();
  return createServerClient<Database>(config.url, config.key, {
    cookieOptions: { sameSite: "lax", secure: process.env.SITE_URL?.startsWith("https://") },
    cookies: {
      getAll: () => store.getAll(),
      setAll(values) {
        try {
          values.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Proxy refreshes cookies when rendering a Server Component.
        }
      },
    },
  });
}
