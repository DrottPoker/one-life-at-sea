import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "@/lib/env";
import { isHospitalAccessiblePath } from "@/lib/hospital";
import { attackUrl } from "@/lib/combat";
import { withDatabaseRetry } from "@/lib/database-retry";
import type { Database } from "@/lib/database.types";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const config = getSupabaseConfig();
  if (config) {
    const supabase = createServerClient<Database>(config.url, config.key, {
      cookieOptions: { sameSite: "lax", secure: process.env.SITE_URL?.startsWith("https://") },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(values, cacheHeaders) {
          values.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(cacheHeaders ?? {}).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    });
    const { data } = await supabase.auth.getClaims();
    if (data?.claims && (request.method === "GET" || request.method === "HEAD")) {
      const { data: lock, error } = await withDatabaseRetry(() => supabase.rpc("get_navigation_lock"));
      if (error) {
        const unavailable = new NextResponse("Your game state could not be verified. Please reload.", { status: 503 });
        response.cookies.getAll().forEach(cookie => unavailable.cookies.set(cookie));
        response = unavailable;
      } else {
        const destination = lock?.hospital_until ? "/harbor/hospital" : lock?.attack ? attackUrl(lock.attack.target_id) : null;
        const allowedHospitalPage = !!lock?.hospital_until && isHospitalAccessiblePath(request.nextUrl.pathname);
        if (destination && request.nextUrl.pathname !== destination && !allowedHospitalPage) {
          const redirect = NextResponse.redirect(new URL(destination, request.url));
          response.cookies.getAll().forEach(cookie => redirect.cookies.set(cookie));
          response = redirect;
        }
      }
    }
  }
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"] };
