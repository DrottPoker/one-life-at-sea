"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireCharacter } from "@/lib/player";
import { createClient } from "@/lib/supabase/server";
import { withDatabaseRetry } from "@/lib/database-retry";
import { isUuid } from "@/lib/validation";
import { gameplay } from "@/config/public";
import { FORUM_IMAGE_BUCKET, forumBanLengths, forumModerationActions, forumReportReasons, isForumBoardId, isForumId, normalizeForumBody, normalizeForumPoll, validForumBody, validForumPoll,
  validForumSignature, validForumTitle, validModerationReason, validReportNote,
  type ForumEditReceipt, type ForumModerationReceipt, type ForumModerationRequest, type ForumPoll, type ForumPostHistory, type ForumPostResult,
  type ForumReaction, type ForumReactionReceipt, type ForumReportReason, type ForumReportReceipt, type ForumSettings, type ForumWithdrawReceipt, type PendingForumPost } from "@/lib/forums";
import { isPlayerNumber } from "@/lib/player-identity";

const changedAccount = "Your signed-in character changed. Reload the forum.";
const messages: Record<string, string> = {
  FORUM_NOT_FOUND: "This forum, thread or post is no longer available.",
  FORUM_READ_ONLY: "You cannot post here.",
  THREAD_LOCKED: "This thread is locked.",
  INVALID_POST: "Check the title and post and keep them within the character limits.",
  INVALID_QUOTE: "The quoted post is no longer available. Remove the quote and try again.",
  DUPLICATE_POST: "You already posted this. Write something new.",
  FORUM_THREAD_LIMIT: `You can start at most ${gameplay.forum.threadsPerHour} threads per hour.`,
  EDIT_CONFLICT: "This post changed after you opened it. Reload to see the latest version.",
  POST_REMOVED: "This post has been removed.",
  ADMIN_REQUIRED: "Only administrators can do this.",
  MODERATOR_REQUIRED: "Moderator access is required.",
  SELF_REPORT: "You cannot report your own post.",
  FORUM_NO_CHANGE: "Nothing changed because this was already done. Reload the page.",
  FORUM_FORBIDDEN: "You can only change your own posts.",
  LAST_VISIBLE_POST: "This is the last visible post. Remove the whole thread instead.",
  CANNOT_RESTORE: "Content withdrawn by its author cannot be restored.",
  THREAD_REMOVED: "Restore the thread first.",
  SELF_REACTION: "You cannot react to your own post.",
  NEW_CHARACTER: `New captains can dislike and report posts after ${gameplay.forum.newCharacterHours} hours.`,
  FORUM_RATE_LIMIT: "You are reacting too quickly. Please wait a minute.",
  REQUEST_MISMATCH: "This saved request does not match the original. Reload the page.",
  INVALID_POLL: "Check the poll: a question, at least two different options and a valid number of choices.",
  INVALID_VOTE: "Choose the options you want, up to the number the poll allows.",
  POLL_CLOSED: "This poll is closed.",
  INVALID_SIGNATURE: `Keep your signature within ${gameplay.forum.signatureMaxLength} characters and ${gameplay.forum.signatureMaxLines} lines.`,
  INVALID_IMAGE: "An image in this post is no longer available. Remove it and try again.",
  TOO_MANY_IMAGES: `A post can show at most ${gameplay.forum.imagesPerPost} images.`,
};
const newCaptainHours = gameplay.forum.newCharacterHours;
type RpcError = { message: string; details?: string | null } | null;
function knownError(error: RpcError, overrides: Record<string, string> = {}) {
  if (error && Object.hasOwn(overrides, error.message)) return overrides[error.message];
  if (error?.message === "FORUM_BANNED") {
    const until = Date.parse(error.details ?? "");
    return Number.isNaN(until) ? "You are banned from posting in the forums." : "You are banned from posting in the forums until " + new Date(until).toUTCString() + ".";
  }
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
  const poll = post.kind === "thread" && post.poll ? normalizeForumPoll(post.poll) : null;
  if (poll && !validForumPoll(poll)) return { error: messages.INVALID_POLL };
  const client = await createClient();
  const { data, error } = await withDatabaseRetry(() => post.kind === "thread"
    ? client.rpc("create_forum_thread", { board_id: post.boardId, thread_title: post.title.trim(), post_body: body, request_id: post.id, poll })
    : client.rpc("create_forum_post", { thread_id: post.threadId, post_body: body, quoted_post_id: post.quotedPostId, request_id: post.id }));
  if (error || !data) {
    const known = knownError(error);
    return { error: known ?? "Posting could not be confirmed. Retry to check the same post.", retry: !known || error?.message === "REQUEST_MISMATCH" };
  }
  revalidatePath("/forums", "layout");
  // Reply notices go out once the response is sent; a scheduled job catches anything missed.
  if (post.kind === "reply") after(async () => { await client.rpc("deliver_forum_notifications"); });
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
  if (request.action === "ban_player") {
    return (keys === "player_number" || keys === "hours,player_number") && isPlayerNumber(payload.player_number) &&
      (payload.hours === undefined || forumBanLengths.some(length => length.hours === payload.hours));
  }
  if (["unban_player", "grant_moderator", "revoke_moderator", "clear_signature"].includes(request.action)) return keys === "player_number" && isPlayerNumber(payload.player_number);
  if (request.action.endsWith("_image")) return keys === "image_id" && isUuid(payload.image_id);
  if (request.action.endsWith("_poll")) return keys === "thread_id" && isForumId(payload.thread_id);
  if (request.action === "edit_post") {
    return (keys === "body,post_id" || keys === "body,post_id,title") && isForumId(payload.post_id) && validForumBody(normalizeForumBody(payload.body)) &&
      (payload.title === undefined || validForumTitle(payload.title.trim()));
  }
  return request.action.endsWith("_post") || request.action === "dismiss_reports" ? keys === "post_id" && isForumId(payload.post_id) : keys === "thread_id" && isForumId(payload.thread_id);
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
    const known = error?.message === "FORUM_FORBIDDEN" ? "You cannot act on yourself, an administrator or, unless you are an administrator, another moderator." : knownError(error);
    return { error: known ?? "The action could not be confirmed. Retry to check the same request.", retry: !known };
  }
  // The purge is logged first and hides the image at once; the file is then deleted with the
  // administrator's session. Retrying the same request repeats only the deletion.
  if (request.action === "purge_image" && data.image_path) {
    const removed = await client.storage.from(FORUM_IMAGE_BUCKET).remove([data.image_path]);
    if (removed.error) return { error: "The image is hidden, but its file could not be deleted yet. Retry to delete it.", retry: true };
  }
  revalidatePath("/forums", "layout");
  return { receipt: data };
}

export async function loadForumPostHistory(characterId: string, postId: string): Promise<{ error?: string; history?: ForumPostHistory }> {
  if (!await currentCharacter(characterId)) return { error: changedAccount };
  if (!isForumId(postId)) return { error: messages.FORUM_NOT_FOUND };
  const client = await createClient();
  const { data, error } = await withDatabaseRetry(() => client.rpc("get_forum_post_history", { post_id: postId }));
  if (error || !data) return { error: error?.message === "FORUM_FORBIDDEN" ? messages.MODERATOR_REQUIRED : knownError(error) ?? "The history could not be loaded." };
  return { history: data };
}

// A reaction sets a state, so a repeated or retried request is harmless.
export async function setForumReaction(characterId: string, postId: string, reaction: ForumReaction): Promise<{ error?: string; receipt?: ForumReactionReceipt }> {
  if (!await currentCharacter(characterId)) return { error: changedAccount };
  if (!isForumId(postId) || ![-1, 0, 1].includes(reaction)) return { error: messages.FORUM_NOT_FOUND };
  const client = await createClient();
  const { data, error } = await withDatabaseRetry(() => client.rpc("set_forum_reaction", { post_id: postId, reaction }));
  if (error || !data) return { error: knownError(error) ?? "Your reaction could not be saved. Please try again." };
  revalidatePath("/forums", "layout");
  return { receipt: data };
}

export async function setForumSubscription(characterId: string, threadId: string, subscribed: boolean): Promise<string | null> {
  if (!await currentCharacter(characterId)) return changedAccount;
  if (!isForumId(threadId) || typeof subscribed !== "boolean") return messages.FORUM_NOT_FOUND;
  const client = await createClient();
  const { error } = await withDatabaseRetry(() => client.rpc("set_forum_subscription", { thread_id: threadId, subscribed }));
  if (error) return knownError(error) ?? "Your subscription could not be changed. Please try again.";
  revalidatePath("/forums", "layout");
  return null;
}

// One open report per captain and post, so a repeated report is harmless.
export async function reportForumPost(characterId: string, postId: string, reason: ForumReportReason, note: string): Promise<{ error?: string; receipt?: ForumReportReceipt }> {
  if (!await currentCharacter(characterId)) return { error: changedAccount };
  if (!isForumId(postId) || !forumReportReasons.some(item => item.id === reason) || !validReportNote(note)) return { error: "Choose a reason and keep the note under 500 characters." };
  const client = await createClient();
  const { data, error } = await withDatabaseRetry(() => client.rpc("report_forum_post", { post_id: postId, reason, note: note.trim() }));
  if (error || !data) return { error: knownError(error) ?? "The report could not be sent. Please try again." };
  revalidatePath("/forums", "layout");
  return { receipt: data };
}

// A vote sets the captain's choices, so a repeated or retried request is harmless.
export async function voteForumPoll(characterId: string, threadId: string, choices: number[]): Promise<{ error?: string; poll?: ForumPoll }> {
  if (!await currentCharacter(characterId)) return { error: changedAccount };
  if (!isForumId(threadId) || !Array.isArray(choices) || choices.length > gameplay.forum.pollOptionsMax ||
    !choices.every(choice => Number.isInteger(choice) && choice >= 1 && choice <= gameplay.forum.pollOptionsMax)) return { error: messages.INVALID_VOTE };
  const client = await createClient();
  const { data, error } = await withDatabaseRetry(() => client.rpc("vote_forum_poll", { thread_id: threadId, choices }));
  if (error || !data) return { error: knownError(error, { NEW_CHARACTER: `New captains can vote after ${newCaptainHours} hours.` }) ?? "Your vote could not be saved. Please try again." };
  revalidatePath("/forums", "layout");
  return { poll: data };
}

export async function closeForumPoll(characterId: string, threadId: string): Promise<{ error?: string; poll?: ForumPoll }> {
  if (!await currentCharacter(characterId)) return { error: changedAccount };
  if (!isForumId(threadId)) return { error: messages.FORUM_NOT_FOUND };
  const client = await createClient();
  const { data, error } = await withDatabaseRetry(() => client.rpc("close_forum_poll", { thread_id: threadId }));
  if (error || !data) return { error: knownError(error, { FORUM_FORBIDDEN: "Only the thread's author can close its poll." }) ?? "The poll could not be closed. Please try again." };
  revalidatePath("/forums", "layout");
  return { poll: data };
}

// Saving the same settings again changes nothing.
export async function saveForumSettings(characterId: string, signature: string, showSignatures: boolean): Promise<{ error?: string; settings?: ForumSettings }> {
  if (!await currentCharacter(characterId)) return { error: changedAccount };
  const text = typeof signature === "string" ? normalizeForumBody(signature) : null;
  if (!validForumSignature(text) || typeof showSignatures !== "boolean") return { error: messages.INVALID_SIGNATURE };
  const client = await createClient();
  const { data, error } = await withDatabaseRetry(() => client.rpc("set_forum_settings", { signature: text, show_signatures: showSignatures }));
  if (error || !data) return { error: knownError(error, { NEW_CHARACTER: `New captains can add a signature after ${newCaptainHours} hours.` }) ?? "Your settings could not be saved. Please try again." };
  revalidatePath("/forums", "layout");
  return { settings: data };
}
