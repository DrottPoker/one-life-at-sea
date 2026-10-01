import { gameplay } from "@/config/public";
import { isBigintId, isUuid, normalizePlainText } from "@/lib/validation";

export type ForumPosting = "open" | "moderators" | "closed";
export type ForumPerson = { display_name: string; player_number: number; deleted: boolean };
export type ForumAuthor = ForumPerson & { level: number | null; posts: number | null; karma: number | null; joined_at: string | null; role: "admin" | "moderator" | null };
export type ForumBan = { ends_at: string | null; reason: string };
// A null person is a post its author deleted, shown to players as [deleted].
export type ForumLastPost = { post_id: string; post_number: number; posted_at: string; author: ForumPerson | null };
export type ForumBoardSummary = {
  id: string; section: string; name: string; description: string; posting: ForumPosting; active: boolean; thread_count: number; post_count: number;
  last_post: (ForumLastPost & { thread_id: string; title: string }) | null; unread: boolean;
};
export type ForumThreadSummary = {
  id: string; title: string; board_id: string; author: ForumPerson | null; created_at: string; replies: number; views: number; post_seq: number;
  pinned: boolean; locked: boolean; poll: boolean; rating: number | null; last_post: ForumLastPost | null; last_read_number: number | null; unread: boolean;
};
export type ForumPopularThread = ForumThreadSummary & { board: { id: string; name: string } };
export type ForumIndex = { boards: ForumBoardSummary[]; popular: ForumPopularThread[]; can_moderate: boolean; ban: ForumBan | null; open_reports: number | null };
export type ForumBoardPage = {
  board: { id: string; section: string; name: string; description: string; posting: ForumPosting; active: boolean; can_post: boolean; can_upload_images: boolean };
  items: ForumThreadSummary[]; total: number; page: number; page_size: number; can_moderate: boolean; ban: ForumBan | null;
};
export type ForumImageInfo = { width: number; height: number; removed: boolean; purged: boolean };
export type ForumImages = Record<string, ForumImageInfo>;
export type ForumImageReservation = { image_id: string; path: string; width: number; height: number };
export type ForumPollOption = { number: number; label: string; votes: number | null };
export type ForumPollDetails = {
  question: string; max_choices: number; closes_at: string | null; closed: boolean; closed_by: "author" | "moderator" | null; removed: boolean;
  voters: number; my_choices: number[]; can_vote: boolean; results: boolean; can_close: boolean; options: ForumPollOption[];
};
// Players see only { removed: true } once a moderator removes a poll.
export type ForumPoll = ForumPollDetails | { removed: true; question?: undefined };
export type ForumPollInput = { question: string; options: string[]; max_choices: number; days: number | null };
export type ForumSettings = { signature: string; show_signatures: boolean; ban: ForumBan | null; can_sign: boolean };
export type ForumQuote = { post_id: string; number: number; author: ForumPerson | null; body: string | null; removed: boolean; edited_after: boolean };
export type ForumPost = {
  id: string; number: number; author: ForumAuthor | null; created_at: string; body: string | null; format_version: number; edit_count: number; images: ForumImages | null;
  edited: { at: string; by: string | null; moderator: boolean; count: number } | null;
  removed: { by: "author" | "moderator"; at: string } | null; quote: ForumQuote | null; own: boolean; can_edit: boolean; can_withdraw: boolean;
  likes: number | null; dislikes: number | null; my_reaction: ForumReaction; can_react: boolean; can_dislike: boolean;
  ignored: boolean; reported: boolean; can_report: boolean;
  // False for a player moderator's own posts and posts by administrators or other moderators.
  can_moderate: boolean;
};
export type ForumThread = {
  id: string; title: string; board: { id: string; name: string; section: string; posting: ForumPosting }; author: ForumPerson | null; created_at: string;
  pinned: boolean; locked: boolean; removed: { by: "moderator"; at: string } | null; post_count: number; post_seq: number; views: number;
  last_read_number: number | null; can_reply: boolean; can_moderate: boolean; can_moderate_thread: boolean; subscribed: boolean; can_upload_images: boolean; can_purge_images: boolean; poll: ForumPoll | null;
};
// Signatures are keyed by the author's player number.
export type ForumThreadPage = {
  thread: ForumThread; posts: ForumPost[]; signatures: Record<string, string>; page: number; page_count: number; page_size: number; ban: ForumBan | null;
};
export type ForumLocation = { thread_id: string; post_number: number; page: number };
export type ForumReceipt = { thread_id: string; post_id: string; post_number: number; created_at: string };
export type ForumEditReceipt = { post_id: string; edit_count: number };
export type ForumWithdrawReceipt = { post_id: string };
export type ForumReaction = -1 | 0 | 1;
export type ForumReactionReceipt = { post_id: string; likes: number; dislikes: number; reaction: ForumReaction };
export type ForumSearchItem = {
  post_id: string; post_number: number; created_at: string; excerpt: string; author: ForumPerson;
  thread: { id: string; title: string }; board: { id: string; name: string };
};
export type ForumSearchPage = { items: ForumSearchItem[]; total: number; page: number; page_size: number };
export type ForumSubscription = ForumThreadSummary & { board: { id: string; name: string }; new_posts: number };
export type ForumSubscriptionPage = { items: ForumSubscription[]; total: number; page: number; page_size: number };
export type ForumAuthorStats = { post_count: number; thread_count: number; karma: number };
export type ForumRevision = { revision: number; title: string | null; body: string; replaced_at: string; editor: string | null };
export type ForumPostHistory = { post_id: string; revisions: ForumRevision[] };
export type ForumModerationAction = "pin_thread" | "unpin_thread" | "lock_thread" | "unlock_thread" | "move_thread" | "grave_thread" |
  "remove_thread" | "restore_thread" | "remove_post" | "restore_post" | "edit_post" | "dismiss_reports" |
  "ban_player" | "unban_player" | "grant_moderator" | "revoke_moderator" |
  "close_poll" | "remove_poll" | "restore_poll" | "remove_image" | "restore_image" | "purge_image" | "clear_signature";
export type ForumModerationReceipt = { message: string; thread_id: string | null; post_id: string | null; image_path?: string };
export type ForumModerationRequest = { id: string; action: ForumModerationAction; payload: Record<string, string>; reason: string };
export type PendingForumPost = { id: string; kind: "thread"; boardId: string; title: string; body: string; poll: ForumPollInput | null } |
  { id: string; kind: "reply"; threadId: string; body: string; quotedPostId: string | null };
export type ForumPostResult = { error?: string; retry?: boolean; receipt?: ForumReceipt };

export const forumModerationActions: readonly ForumModerationAction[] = ["pin_thread", "unpin_thread", "lock_thread", "unlock_thread", "move_thread",
  "grave_thread", "remove_thread", "restore_thread", "remove_post", "restore_post", "edit_post", "dismiss_reports",
  "ban_player", "unban_player", "grant_moderator", "revoke_moderator",
  "close_poll", "remove_poll", "restore_poll", "remove_image", "restore_image", "purge_image", "clear_signature"];
export const forumReportReasons = [
  { id: "spam", label: "Spam or advertising" }, { id: "harassment", label: "Harassment or threats" }, { id: "offensive", label: "Offensive content" },
  { id: "rules", label: "Breaks the forum rules" }, { id: "other", label: "Something else" },
] as const;
export type ForumReportReason = (typeof forumReportReasons)[number]["id"];
// Ban lengths offered to moderators; no length means a permanent ban.
export const forumBanLengths = [
  { hours: "1", label: "1 hour" }, { hours: "24", label: "1 day" }, { hours: "168", label: "7 days" }, { hours: "720", label: "30 days" }, { hours: null, label: "Permanent" },
] as const;
export type ForumReportReceipt = { report_id: string; already: boolean };
export type ForumReportEntry = {
  post: { id: string; number: number; excerpt: string; removed: "author" | "moderator" | null; author: ForumPerson; can_moderate: boolean };
  thread: { id: string; title: string; removed: boolean }; board: { id: string; name: string };
  reports: { id: string; reason: ForumReportReason; note: string; created_at: string; status: "open" | "resolved" | "dismissed"; reporter: ForumPerson; handled_by: string | null; handled_at: string | null }[];
};
export type ForumReportPage = { items: ForumReportEntry[]; total: number; page: number; page_size: number };
export type ForumModerationOverview = {
  can_manage_moderators: boolean; open_reports: number;
  bans: { player: ForumPerson; starts_at: string; ends_at: string | null; reason: string; banned_by: string; can_lift: boolean }[];
  moderators: { player: ForumPerson; granted_at: string; granted_by: string | null }[];
  log: { id: string; action: ForumModerationAction; actor: string; reason: string; created_at: string; payload: Record<string, string>; thread: { id: string; title: string } | null; post_id: string | null }[];
  log_total: number; page: number; page_size: number;
};

export const isForumId = isBigintId;
export function isForumBoardId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z][a-z0-9_]{0,47}$/.test(value);
}
export function forumBoard(id: string) {
  return gameplay.forum.boards.find(board => board.id === id) ?? null;
}
export const normalizeForumBody = normalizePlainText;
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
function hasControl(characters: string[], allowNewline: boolean) {
  return characters.some(character => { const code = character.charCodeAt(0); return (code < 32 && !(allowNewline && code === 10)) || code === 127; });
}
// One trimmed line, as the database checks poll questions and options.
export function validForumLine(value: unknown, maxLength: number): value is string {
  if (typeof value !== "string" || !value || value !== value.trim()) return false;
  const characters = Array.from(value);
  return characters.length <= maxLength && !hasControl(characters, false);
}
// Trims a poll's text. A request may carry any shape, so anything that is not poll-like passes
// through unchanged for validForumPoll to refuse.
export function normalizeForumPoll<T>(poll: T): T {
  if (!poll || typeof poll !== "object" || Array.isArray(poll)) return poll;
  const value = poll as Record<string, unknown>;
  return { ...value, question: typeof value.question === "string" ? value.question.trim() : value.question,
    options: Array.isArray(value.options) ? value.options.map(option => typeof option === "string" ? option.trim() : option) : value.options } as T;
}
export function validForumPoll(value: unknown): value is ForumPollInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const poll = value as Record<string, unknown>;
  if (Object.keys(poll).some(key => !["question", "options", "max_choices", "days"].includes(key)) || !Array.isArray(poll.options)) return false;
  const options = poll.options;
  const choices = poll.max_choices, days = poll.days;
  return validForumLine(poll.question, gameplay.forum.pollQuestionMaxLength) && options.length >= 2 && options.length <= gameplay.forum.pollOptionsMax &&
    options.every(option => validForumLine(option, gameplay.forum.pollOptionMaxLength)) &&
    new Set(options.map(option => (option as string).toLowerCase())).size === options.length &&
    Number.isInteger(choices) && (choices as number) >= 1 && (choices as number) <= options.length &&
    (days === null || (Number.isInteger(days) && (days as number) >= 1 && (days as number) <= gameplay.forum.pollMaxDays));
}
// Durations offered when a poll is created; the database accepts any whole number up to the limit.
export const forumPollDurations = [1, 3, 7, 14, 30].filter(days => days <= gameplay.forum.pollMaxDays);
// Signatures are normalized like posts and may be empty.
export function validForumSignature(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value === "") return true;
  const characters = Array.from(value);
  return value === normalizeForumBody(value) && characters.length <= gameplay.forum.signatureMaxLength &&
    value.split("\n").length <= gameplay.forum.signatureMaxLines && !hasControl(characters, true);
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

// "by:" picks an author by name or player number; the rest is searched as words and "phrases".
export function parseForumSearch(value: string) {
  const author = /(?:^|\s)by:(\S+)/i.exec(value)?.[1] ?? null;
  return { text: value.replace(/(?:^|\s)by:\S+/gi, " ").replace(/\s+/g, " ").trim(), author: author && author.length <= 40 ? author : null };
}
export function forumSearchUrl(query: string, options: { page?: number; threads?: boolean; board?: string | null } = {}) {
  const params = new URLSearchParams({ q: query });
  if (options.threads) params.set("threads", "1");
  if (options.board) params.set("board", options.board);
  if (options.page) params.set("page", String(options.page + 1));
  return "/forums/search?" + params.toString();
}
export function forumSubscriptionsUrl(page = 0) { return withPage("/forums/subscriptions", page); }
export function forumSettingsUrl() { return "/forums/settings"; }
// Images are served by the app after the database has checked who may see them.
export function forumImageUrl(imageId: string) { return "/api/forum-images/" + imageId + ".webp"; }
export const FORUM_IMAGE_BUCKET = "forum-images";
export function forumModerationUrl(view: "reports" | "resolved" | "dismissed" | "people" | "log" = "reports", page = 0) {
  const params = new URLSearchParams();
  if (view !== "reports") params.set("view", view);
  if (page > 0) params.set("page", String(page + 1));
  return "/forums/moderation" + (params.size ? "?" + params.toString() : "");
}
export function validReportNote(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const characters = Array.from(value.trim());
  return characters.length <= 500 && !characters.some(character => { const code = character.charCodeAt(0); return (code < 32 && code !== 9 && code !== 10) || code === 127; });
}

export function isForumPath(pathname: string) {
  if (["/forums", "/forums/search", "/forums/subscriptions", "/forums/moderation", "/forums/settings"].includes(pathname)) return true;
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
    // Drafts saved before polls existed have no poll field.
    const poll = "poll" in value ? value.poll : null;
    if (poll !== null && !validForumPoll(poll)) throw new Error("Invalid saved post.");
    return { id: value.id, kind: "thread", boardId: value.boardId, title: value.title, body: value.body, poll };
  }
  if ("kind" in value && value.kind === "reply" && "threadId" in value && isForumId(value.threadId) && "quotedPostId" in value &&
    (value.quotedPostId === null || isForumId(value.quotedPostId))) {
    return { id: value.id, kind: "reply", threadId: value.threadId, body: value.body, quotedPostId: value.quotedPostId };
  }
  throw new Error("Invalid saved post.");
}
