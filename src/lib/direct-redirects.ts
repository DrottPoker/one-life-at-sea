import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { NavigationLock } from "@/lib/game-navigation";
import { forumPostUrl, isForumId } from "@/lib/forums";
import { attackUrl } from "@/lib/combat";
import { isPlayerNumber, playerProfileUrl } from "@/lib/player-identity";
import { isUuid } from "@/lib/validation";

export type DirectRedirect = { location: string; permanent: boolean };

async function playerNumber(supabase: SupabaseClient<Database>, characterId: string) {
  const { data } = await supabase.from("character_profiles").select("player_number").eq("character_id", characterId).maybeSingle();
  return data?.player_number ?? null;
}

// Routes that only forward to another page are answered with an HTTP redirect before rendering.
// Redirecting from a page would start streaming its loading state first, and the browser would
// leave while the server was still rendering. The pages stay as a fallback, for example to show
// "not found" when nothing matches.
export async function directRedirect(supabase: SupabaseClient<Database>, url: URL, lock: NavigationLock): Promise<DirectRedirect | null> {
  const parts = url.pathname.split("/");
  if (url.pathname === "/") {
    return { location: lock.sea_state === null ? "/create-character" : lock.sea_state === "in_harbor" ? "/harbor" : "/sea", permanent: false };
  }
  if (parts.length !== 3 && parts.length !== 4) return null;
  const [, section, first, second] = parts;
  if (parts.length === 3 && section === "characters" && isUuid(first)) {
    const number = await playerNumber(supabase, first);
    return number === null ? null : { location: playerProfileUrl(number), permanent: true };
  }
  if (parts.length === 3 && section === "attack" && isUuid(first)) {
    const number = await playerNumber(supabase, first);
    return number === null ? null : { location: attackUrl(number), permanent: true };
  }
  if (parts.length === 3 && section === "messages" && isPlayerNumber(first)) return { location: "/messages/compose?to=" + first, permanent: false };
  if (parts.length === 4 && section === "combat" && first === "prepare" && second) return { location: "/attack/" + second, permanent: false };
  if (parts.length === 4 && section === "forums" && (first === "posts" || (first === "threads" && url.searchParams.get("unread") === "1")) && isForumId(second)) {
    const { data, error } = await supabase.rpc("locate_forum_post", first === "posts" ? { post_id: second } : { thread_id: second });
    return error || !data ? null : { location: forumPostUrl(data.thread_id, data.post_number), permanent: false };
  }
  return null;
}
