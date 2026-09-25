"use server";

import { revalidatePath } from "next/cache";
import { requireCharacter } from "@/lib/player";
import { createClient } from "@/lib/supabase/server";
import { withDatabaseRetry } from "@/lib/database-retry";
import { isUuid } from "@/lib/validation";
import { gameplay } from "@/config/public";
import { forumModerationActions, isForumBoardId, isForumId, normalizeForumBody, validForumBody, validForumTitle, validModerationReason,
  type ForumEditReceipt, type ForumModerationReceipt, type ForumModerationRequest, type ForumPostHistory, type ForumPostResult,
  type ForumWithdrawReceipt, type PendingForumPost } from "@/lib/forums";

const changedAccount = "Your signed-in character changed. Reload the forum.";
const messages: Record<string, string> = {
  FORUM_NOT_FOUND: "This forum, thread or post is no longer available.",
  FORUM_READ_ONLY: "You cannot post here.",
  THREAD_LOCKED: "This thread is locked.",
  FORUM_FORBIDDEN: "You can only change your own posts.",
  INVALID_POST: "Check the title and post and keep them within the character limits.",
  INVALID_QUOTE: "The quoted post is no longer available. Remove the quote and try again.",
  DUPLICATE_POST: "You already posted this. Write something new.",
  FORUM_THREAD_LIMIT: `You can start at most ${gameplay.forum.threadsPerHour} threads per hour.`,
  EDIT_CONFLICT: "This post changed after you opened it. Reload to see the latest version.",
  POST_REMOVED: "This post has been removed.",
  ADMIN_REQUIRED: "Moderator access is required.",
  FORUM_NO_CHANGE: "Nothing changed because this was already done. Reload the page.",
  LAST_VISIBLE_POST: "This is the last visible post. Remove the whole thread instead.",
  CANNOT_RESTORE: "Content withdrawn by its author cannot be restored.",
  THREAD_REMOVED: "Restore the thread first.",
  REQUEST_MISMATCH: "This saved request does not match the original. Reload the page.",
};
type RpcError = { message: string; details?: string | null } | null;
function knownError(error: RpcError) {
  if (error?.message === "FORUM_COOLDOWN") {
    const seconds = Number(error.details);
    return Number.isSafeInteger(seconds) && seconds > 0 ? `Please wait ${seconds} ${seconds === 1 ? "second" : "seconds"} before posting again.` : "Please wait before posting again.";
  }
  return error && Object.hasOwn(messages, error.message) ? messages[error.message] : undefined;
}
async function currentCharacter(characterId: string) {
  const character = await requireCharacter({ allowHospital: true, allowSea: true });
  return character.id === characterId;
}

export async function submitForumPost(characterId: string, post: PendingForumPost): Promise<ForumPostResult> {
  if (!await currentCharacter(characterId)) return { error: changedAccount, retry: true };
  const body = post && typeof post.body === "string" ? normalizeForumBody(post.body) : null;
  if (!post || !isUuid(post.id) || !validForumBody(body) ||
    (post.kind === "thread" ? !isForumBoardId(post.boardId) || typeof post.title !== "string" || !validForumTitle(post.title.trim())
      : post.kind !== "reply" || !isForumId(post.threadId) || (post.quotedPostId !== null && !isForumId(post.quotedPostId)))) {
    return { error: messages.INVALID_POST };
  }
  const client = await createClient();
  const { data, error } = await withDatabaseRetry(() => post.kind === "thread"
    ? client.rpc("create_forum_thread", { board_id: post.boardId, thread_title: post.title.trim(), post_body: body, request_id: post.id })
    : client.rpc("create_forum_post", { thread_id: post.threadId, post_body: body, quoted_post_id: post.quotedPostId, request_id: post.id }));
  if (error || !data) {
    const known = knownError(error);
    return { error: known ?? "Posting could not be confirmed. Retry to check the same post.", retry: !known || error?.message === "REQUEST_MISMATCH" };
  }
  revalidatePath("/forums", "layout");
  return { receipt: data };
}

export async function editForumPost(characterId: string, postId: string, body: string, title: string | null, expectedEditCount: number): Promise<{ error?: string; receipt?: ForumEditReceipt }> {
  if (!await currentCharacter(characterId)) return { error: changedAccount };
  const text = typeof body === "string" ? normalizeForumBody(body) : null;
  if (!isForumId(postId) || !validForumBody(text) || (title !== null && (typeof title !== "string" || !validForumTitle(title.trim()))) ||
    !Number.isSafeInteger(expectedEditCount) || expectedEditCount < 0) return { error: messages.INVALID_POST };
  const client = await createClient();
  const { data, error } = await withDatabaseRetry(() => client.rpc("edit_forum_post", {
    post_id: postId, post_body: text, thread_title: title === null ? null : title.trim(), expected_edit_count: expectedEditCount,
  }));
  if (error || !data) return { error: knownError(error) ?? "The post could not be saved. Please try again." };
  revalidatePath("/forums", "layout");
  return { receipt: data };
}

export async function withdrawForumPost(characterId: string, postId: string): Promise<{ error?: string; receipt?: ForumWithdrawReceipt }> {
  if (!await currentCharacter(characterId)) return { error: changedAccount };
  if (!isForumId(postId)) return { error: messages.FORUM_NOT_FOUND };
  const client = await createClient();
  const { data, error } = await withDatabaseRetry(() => client.rpc("withdraw_forum_post", { post_id: postId }));
  if (error || !data) return { error: knownError(error) ?? "The post could not be deleted. Please try again." };
  revalidatePath("/forums", "layout");
  return { receipt: data };
}

// Called only by a mounted, visible thread; server renders never mark posts read.
export async function markForumThreadRead(characterId: string, threadId: string, throughNumber: number): Promise<string | null> {
  if (!await currentCharacter(characterId)) return changedAccount;
  if (!isForumId(threadId) || !Number.isSafeInteger(throughNumber) || throughNumber < 1) return messages.FORUM_NOT_FOUND;
  const client = await createClient();
  const { error } = await withDatabaseRetry(() => client.rpc("mark_forum_thread_read", { thread_id: threadId, through_number: throughNumber }));
  return error ? knownError(error) ?? "Read progress could not be saved." : null;
}

export async function markForumBoardRead(characterId: string, boardId: string | null): Promise<string | null> {
  if (!await currentCharacter(characterId)) return changedAccount;
  if (boardId !== null && !isForumBoardId(boardId)) return messages.FORUM_NOT_FOUND;
  const client = await createClient();
  const { error } = await withDatabaseRetry(() => client.rpc("mark_forum_board_read", boardId === null ? {} : { board_id: boardId }));
  if (error) return knownError(error) ?? "The forum could not be marked as read. Please try again.";
  revalidatePath("/forums", "layout");
  return null;
}

function validModerationPayload(request: ForumModerationRequest) {
  const payload = request.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || Object.values(payload).some(value => typeof value !== "string")) return false;
  const keys = Object.keys(payload).sort().join(",");
  if (request.action === "move_thread") return keys === "board_id,thread_id" && isForumId(payload.thread_id) && isForumBoardId(payload.board_id);
  if (request.action === "edit_post") {
    return (keys === "body,post_id" || keys === "body,post_id,title") && isForumId(payload.post_id) && validForumBody(normalizeForumBody(payload.body)) &&
      (payload.title === undefined || validForumTitle(payload.title.trim()));
  }
  return request.action.endsWith("_post") ? keys === "post_id" && isForumId(payload.post_id) : keys === "thread_id" && isForumId(payload.thread_id);
}

export async function moderateForum(characterId: string, request: ForumModerationRequest): Promise<{ error?: string; retry?: boolean; receipt?: ForumModerationReceipt }> {
  if (!await currentCharacter(characterId)) return { error: changedAccount };
  if (!request || !isUuid(request.id) || !forumModerationActions.includes(request.action) || !validModerationPayload(request) || !validModerationReason(request.reason)) {
    return { error: "Check the action and enter a reason of 3 to 500 characters." };
  }
  const payload = request.action === "edit_post"
    ? { ...request.payload, body: normalizeForumBody(request.payload.body), ...(request.payload.title === undefined ? {} : { title: request.payload.title.trim() }) }
    : request.payload;
  const client = await createClient();
  const { data, error } = await withDatabaseRetry(() => client.rpc("moderate_forum", { action: request.action, payload, request_id: request.id, reason: request.reason.trim() }));
  if (error || !data) {
    const known = knownError(error);
    return { error: known ?? "The action could not be confirmed. Retry to check the same request.", retry: !known };
  }
  revalidatePath("/forums", "layout");
  return { receipt: data };
}

export async function loadForumPostHistory(characterId: string, postId: string): Promise<{ error?: string; history?: ForumPostHistory }> {
  if (!await currentCharacter(characterId)) return { error: changedAccount };
  if (!isForumId(postId)) return { error: messages.FORUM_NOT_FOUND };
  const client = await createClient();
  const { data, error } = await withDatabaseRetry(() => client.rpc("get_forum_post_history", { post_id: postId }));
  if (error || !data) return { error: error?.message === "FORUM_FORBIDDEN" ? messages.ADMIN_REQUIRED : knownError(error) ?? "The history could not be loaded." };
  return { history: data };
}
