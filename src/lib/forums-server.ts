import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function unavailable(error: { message: string } | null): never {
  // Moderator tools look like any missing page to players.
  if (error?.message === "FORUM_NOT_FOUND" || error?.message === "MODERATOR_REQUIRED") notFound();
  throw new Error("The forum could not be loaded. Please try again.");
}
// Cached per render so metadata and the page share one read.
export const loadForumIndex = cache(async () => {
  const { data, error } = await (await createClient()).rpc("get_forum_index");
  return data && !error ? data : unavailable(error);
});
export const loadForumBoard = cache(async (boardId: string, page: number) => {
  const { data, error } = await (await createClient()).rpc("get_forum_board", { board_id: boardId, page });
  return data && !error ? data : unavailable(error);
});
export const loadForumThread = cache(async (threadId: string, page: number) => {
  const { data, error } = await (await createClient()).rpc("get_forum_thread", { thread_id: threadId, page });
  return data && !error ? data : unavailable(error);
});
export async function locateForumPost(target: { post_id: string } | { thread_id: string }) {
  const { data, error } = await (await createClient()).rpc("locate_forum_post", target);
  return data && !error ? data : unavailable(error);
}
export const loadForumSubscriptions = cache(async (page: number) => {
  const { data, error } = await (await createClient()).rpc("get_forum_subscriptions", { page });
  return data && !error ? data : unavailable(error);
});
// An unusable query shows the search form again instead of an error page.
export async function searchForums(args: { query: string; author: string | null; board_id: string | null; threads_only: boolean; page: number }) {
  const { data, error } = await (await createClient()).rpc("search_forums", args);
  if (error?.message === "INVALID_REQUEST") return null;
  return data && !error ? data : unavailable(error);
}
export async function loadForumModeration(page: number) {
  const { data, error } = await (await createClient()).rpc("get_forum_moderation", { page });
  return data && !error ? data : unavailable(error);
}
export async function loadForumReports(status: "open" | "resolved" | "dismissed", page: number) {
  const { data, error } = await (await createClient()).rpc("get_forum_reports", { status, page });
  return data && !error ? data : unavailable(error);
}
export async function loadForumSettings() {
  const { data, error } = await (await createClient()).rpc("get_forum_settings");
  return data && !error ? data : unavailable(error);
}
