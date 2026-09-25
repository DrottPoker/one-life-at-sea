import { gameplay } from "@/config/public";
import { isUuid } from "@/lib/validation";

export type ForumPosting = "open" | "moderators" | "closed";
export type ForumPerson = { display_name: string; player_number: number; deleted: boolean };
export type ForumAuthor = ForumPerson & { level: number | null; posts: number | null; joined_at: string | null; role: "admin" | null };
// A null person is a post its author deleted, shown to players as [deleted].
export type ForumLastPost = { post_id: string; post_number: number; posted_at: string; author: ForumPerson | null };
export type ForumBoardSummary = {
  id: string; section: string; name: string; description: string; posting: ForumPosting; active: boolean; thread_count: number; post_count: number;
  last_post: (ForumLastPost & { thread_id: string; title: string }) | null; unread: boolean;
};
export type ForumIndex = { boards: ForumBoardSummary[]; can_moderate: boolean };
export type ForumThreadSummary = {
  id: string; title: string; board_id: string; author: ForumPerson | null; created_at: string; replies: number; views: number; post_seq: number;
  pinned: boolean; locked: boolean; last_post: ForumLastPost | null; last_read_number: number | null; unread: boolean;
};
export type ForumBoardPage = {
  board: { id: string; section: string; name: string; description: string; posting: ForumPosting; active: boolean; can_post: boolean };
  items: ForumThreadSummary[]; total: number; page: number; page_size: number; can_moderate: boolean;
};
export type ForumQuote = { post_id: string; number: number; author: ForumPerson | null; body: string | null; removed: boolean; edited_after: boolean };
export type ForumPost = {
  id: string; number: number; author: ForumAuthor | null; created_at: string; body: string | null; format_version: number; edit_count: number;
  edited: { at: string; by: string | null; moderator: boolean; count: number } | null;
  removed: { by: "author" | "moderator"; at: string } | null; quote: ForumQuote | null; own: boolean; can_edit: boolean; can_withdraw: boolean;
};
export type ForumThread = {
  id: string; title: string; board: { id: string; name: string; section: string; posting: ForumPosting }; author: ForumPerson | null; created_at: string;
  pinned: boolean; locked: boolean; removed: { by: "moderator"; at: string } | null; post_count: number; post_seq: number; views: number;
  last_read_number: number | null; can_reply: boolean; can_moderate: boolean;
};
export type ForumThreadPage = { thread: ForumThread; posts: ForumPost[]; page: number; page_count: number; page_size: number };
export type ForumLocation = { thread_id: string; post_number: number; page: number };
export type ForumReceipt = { thread_id: string; post_id: string; post_number: number; created_at: string };
export type ForumEditReceipt = { post_id: string; edit_count: number };
export type ForumWithdrawReceipt = { post_id: string };
export type ForumRevision = { revision: number; title: string | null; body: string; replaced_at: string; editor: string | null };
export type ForumPostHistory = { post_id: string; revisions: ForumRevision[] };
export type ForumModerationAction = "pin_thread" | "unpin_thread" | "lock_thread" | "unlock_thread" | "move_thread" | "grave_thread" |
  "remove_thread" | "restore_thread" | "remove_post" | "restore_post" | "edit_post";
export type ForumModerationReceipt = { message: string; thread_id: string | null; post_id: string | null };
export type ForumModerationRequest = { id: string; action: ForumModerationAction; payload: Record<string, string>; reason: string };
export type PendingForumPost = { id: string; kind: "thread"; boardId: string; title: string; body: string } |
  { id: string; kind: "reply"; threadId: string; body: string; quotedPostId: string | null };
export type ForumPostResult = { error?: string; retry?: boolean; receipt?: ForumReceipt };

export const forumModerationActions: readonly ForumModerationAction[] = ["pin_thread", "unpin_thread", "lock_thread", "unlock_thread", "move_thread",
  "grave_thread", "remove_thread", "restore_thread", "remove_post", "restore_post", "edit_post"];

export function isForumId(value: unknown): value is string {
  return typeof value === "string" && /^[1-9][0-9]{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n;
}
export function isForumBoardId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z][a-z0-9_]{0,47}$/.test(value);
}
export function forumBoard(id: string) {
  return gameplay.forum.boards.find(board => board.id === id) ?? null;
}
export function normalizeForumBody(value: string) {
  return value.replace(/\r\n?/g, "\n").replace(/^[ \t\n]+|[ \t\n]+$/g, "");
}
// Mirrors the database: code points, no control characters except tab and newline.
export function validForumBody(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  const characters = Array.from(value);
  return characters.length <= gameplay.forum.postMaxLength && !characters.some(character => {
    const code = character.charCodeAt(0);
    return (code < 32 && code !== 9 && code !== 10) || code === 127;
  });
}
export function validForumTitle(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim() || value !== value.trim()) return false;
  const characters = Array.from(value);
  return characters.length <= gameplay.forum.threadTitleMaxLength && !characters.some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
}
export function validModerationReason(value: unknown): value is string {
  return typeof value === "string" && Array.from(value.trim()).length >= 3 && Array.from(value.trim()).length <= 500;
}

// Page numbers in URLs start at 1; the database counts from 0.
export function parseForumPage(value: string | string[] | undefined) {
  return typeof value === "string" && /^[1-9][0-9]{0,6}$/.test(value) ? Number(value) - 1 : 0;
}
function withPage(path: string, page: number) {
  return page > 0 ? path + "?page=" + (page + 1) : path;
}
export function forumUrl() { return "/forums"; }
export function forumBoardUrl(boardId: string, page = 0) { return withPage("/forums/boards/" + boardId, page); }
export function forumNewThreadUrl(boardId: string) { return "/forums/boards/" + boardId + "/new"; }
export function forumThreadUrl(threadId: string, page = 0, postNumber?: number) {
  return withPage("/forums/threads/" + threadId, page) + (postNumber ? "#post-" + postNumber : "");
}
export function forumPostPage(postNumber: number) {
  return Math.floor((postNumber - 1) / gameplay.forum.postsPageSize);
}
export function forumPostUrl(threadId: string, postNumber: number) {
  return forumThreadUrl(threadId, forumPostPage(postNumber), postNumber);
}
export function forumPermalink(postId: string) { return "/forums/posts/" + postId; }
export function forumUnreadUrl(threadId: string) { return "/forums/threads/" + threadId + "?unread=1"; }
export function forumPageCount(posts: number, pageSize: number) {
  return Math.max(1, Math.ceil(posts / pageSize));
}

export function isForumPath(pathname: string) {
  if (pathname === "/forums") return true;
  const parts = pathname.split("/");
  if (parts.length === 4 && parts[2] === "boards") return isForumBoardId(parts[3]);
  if (parts.length === 5 && parts[2] === "boards" && parts[4] === "new") return isForumBoardId(parts[3]);
  return parts.length === 4 && ["threads", "posts"].includes(parts[2]) && isForumId(parts[3]);
}

export function forumDraftKey(characterId: string, target: { kind: "thread"; boardId: string } | { kind: "reply"; threadId: string }) {
  return "pending-forum:" + characterId + ":" + (target.kind === "thread" ? "board:" + target.boardId : "thread:" + target.threadId);
}
export function parsePendingForumPost(raw: string | null): PendingForumPost | null {
  if (raw === null) return null;
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || !("id" in value) || !isUuid(value.id) || !("body" in value) || !validForumBody(value.body)) throw new Error("Invalid saved post.");
  if ("kind" in value && value.kind === "thread" && "boardId" in value && isForumBoardId(value.boardId) && "title" in value && validForumTitle(value.title)) {
    return { id: value.id, kind: "thread", boardId: value.boardId, title: value.title, body: value.body };
  }
  if ("kind" in value && value.kind === "reply" && "threadId" in value && isForumId(value.threadId) && "quotedPostId" in value &&
    (value.quotedPostId === null || isForumId(value.quotedPostId))) {
    return { id: value.id, kind: "reply", threadId: value.threadId, body: value.body, quotedPostId: value.quotedPostId };
  }
  throw new Error("Invalid saved post.");
}
