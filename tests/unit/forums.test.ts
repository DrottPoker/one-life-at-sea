import { beforeEach, describe, expect, it, vi } from "vitest";
import { gameplay } from "../../src/config/public";
import { forumModerationUrl, validReportNote, forumBoardUrl, forumDraftKey, forumImageUrl, forumPollDurations, forumPostUrl, forumSearchUrl, forumSettingsUrl, forumSubscriptionsUrl, forumThreadUrl,
  isForumBoardId, isForumId, isForumPath, normalizeForumBody, normalizeForumPoll, parseForumPage, parseForumSearch, parsePendingForumPost, validForumBody, validForumPoll,
  validForumSignature, validForumTitle, validModerationReason } from "../../src/lib/forums";
import { forumImageIds, forumLinkTarget, insertForumImage, parseForumMarkup, plainForumText, wrapForumSelection } from "../../src/lib/forum-markup";
import { isHospitalAccessiblePath } from "../../src/lib/hospital";
import { isSeaAccessiblePath } from "../../src/lib/sea-travel";
import { navigationRedirect } from "../../src/lib/game-navigation";

const mocks = vi.hoisted(() => ({ requireCharacter: vi.fn(), createClient: vi.fn(), rpc: vi.fn(), after: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/player", () => ({ requireCharacter: mocks.requireCharacter }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: mocks.after }));
import { closeForumPoll, editForumPost, markForumThreadRead, moderateForum, reportForumPost, saveForumSettings, setForumReaction, setForumSubscription, submitForumPost, voteForumPoll,
  withdrawForumPost } from "../../src/app/forum-actions";

const id = "f0f00000-0000-4000-8000-0000000000a1";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCharacter.mockResolvedValue({ id: "captain" });
  mocks.createClient.mockResolvedValue({ rpc: mocks.rpc, storage: { from: () => ({ remove: mocks.remove }) } });
});

describe("forum routes and values", () => {
  it("accepts exact forum paths in Hospital and at sea", () => {
    for (const path of ["/forums", "/forums/search", "/forums/subscriptions", "/forums/moderation", "/forums/settings", "/forums/boards/general_discussion", "/forums/boards/trading_post/new", "/forums/threads/9223372036854775807", "/forums/posts/1"]) {
      expect(isForumPath(path)).toBe(true);
      expect(isHospitalAccessiblePath(path)).toBe(true);
      expect(isSeaAccessiblePath(path, "at_sea")).toBe(true);
      expect(isSeaAccessiblePath(path, "traveling")).toBe(true);
    }
    for (const path of ["/forums/", "/forums/boards/General", "/forums/boards/x/edit", "/forums/threads/0", "/forums/threads/9223372036854775808", "/forums/posts/01", "/forumsx", "/forums/other/1"]) {
      expect(isForumPath(path)).toBe(false);
    }
    expect(navigationRedirect("/forums", { attack: { battle_id: "test", target_id: "target", target_player_number: 100002 }, hospital_until: null, sea_state: "in_harbor" })).toBe("/attack/100002");
  });
  it("builds one-based page links and post anchors", () => {
    expect(forumBoardUrl("general_discussion")).toBe("/forums/boards/general_discussion");
    expect(forumBoardUrl("general_discussion", 2)).toBe("/forums/boards/general_discussion?page=3");
    expect(forumThreadUrl("12", 0, 3)).toBe("/forums/threads/12#post-3");
    expect(forumPostUrl("12", gameplay.forum.postsPageSize + 1)).toBe("/forums/threads/12?page=2#post-" + (gameplay.forum.postsPageSize + 1));
    expect(parseForumPage("3")).toBe(2);
    for (const value of [undefined, ["2"], "0", "-1", "1.5", "99999999"]) expect(parseForumPage(value)).toBe(0);
  });
  it("separates the author filter from the searched words", () => {
    expect(parseForumSearch("fair winds by:Captain")).toEqual({ text: "fair winds", author: "Captain" });
    expect(parseForumSearch("BY:#100001 \"calm seas\" -storm")).toEqual({ text: "\"calm seas\" -storm", author: "#100001" });
    expect(parseForumSearch("nearby:x standby")).toEqual({ text: "nearby:x standby", author: null });
    expect(parseForumSearch("by:" + "x".repeat(41))).toEqual({ text: "", author: null });
    expect(forumSearchUrl("by:100001", { threads: true, page: 1, board: "trading_post" })).toBe("/forums/search?q=by%3A100001&threads=1&board=trading_post&page=2");
    expect(forumSubscriptionsUrl(2)).toBe("/forums/subscriptions?page=3");
    expect(forumSettingsUrl()).toBe("/forums/settings");
    expect(forumImageUrl(id)).toBe("/api/forum-images/" + id + ".webp");
  });
  it("links moderation views and checks report notes", () => {
    expect(forumModerationUrl()).toBe("/forums/moderation");
    expect(forumModerationUrl("log", 2)).toBe("/forums/moderation?view=log&page=3");
    expect(validReportNote("")).toBe(true);
    expect(validReportNote("Line one\nline two")).toBe(true);
    for (const value of ["x".repeat(501), "\u0000", 5]) expect(validReportNote(value)).toBe(false);
  });
  it("mirrors the database text rules", () => {
    expect(normalizeForumBody("  Hello\r\nCaptain \r")).toBe("Hello\nCaptain");
    expect(validForumBody("<script>stays text</script>")).toBe(true);
    expect(validForumBody("\u{1F600}".repeat(gameplay.forum.postMaxLength))).toBe(true);
    for (const value of [null, " \n", "x".repeat(gameplay.forum.postMaxLength + 1), "\u0000", "\u007f"]) expect(validForumBody(value)).toBe(false);
    expect(validForumTitle("Harbor news")).toBe(true);
    for (const value of ["", " Padded", "Two\nlines", "x".repeat(gameplay.forum.threadTitleMaxLength + 1)]) expect(validForumTitle(value)).toBe(false);
    expect(validModerationReason("  ok  ")).toBe(false);
    expect(validModerationReason("Spam")).toBe(true);
    expect(isForumId("9223372036854775807")).toBe(true);
    expect(isForumBoardId("general_discussion")).toBe(true);
    expect(isForumBoardId("../admin")).toBe(false);
  });
  it("keeps one pending post per target and rejects damaged storage", () => {
    const thread = { id, kind: "thread", boardId: "general_discussion", title: "Title", body: "Body", poll: null };
    const reply = { id, kind: "reply", threadId: "12", body: "Body", quotedPostId: "3" };
    const poll = { question: "Which ship?", options: ["Sloop", "Brig"], max_choices: 1, days: 3 };
    expect(parsePendingForumPost(JSON.stringify(thread))).toEqual(thread);
    // Drafts saved before polls existed still load.
    expect(parsePendingForumPost(JSON.stringify({ ...thread, poll: undefined }))).toEqual(thread);
    expect(parsePendingForumPost(JSON.stringify({ ...thread, poll }))).toEqual({ ...thread, poll });
    expect(() => parsePendingForumPost(JSON.stringify({ ...thread, poll: { ...poll, options: ["Only"] } }))).toThrow();
    expect(parsePendingForumPost(JSON.stringify(reply))).toEqual(reply);
    expect(parsePendingForumPost(null)).toBeNull();
    for (const bad of [{ ...thread, title: "" }, { ...reply, threadId: "x" }, { ...reply, quotedPostId: 3 }, { ...thread, kind: "other" }, { ...thread, id: "bad" }]) {
      expect(() => parsePendingForumPost(JSON.stringify(bad))).toThrow();
    }
    expect(forumDraftKey("a", { kind: "reply", threadId: "1" })).not.toBe(forumDraftKey("b", { kind: "reply", threadId: "1" }));
    expect(forumDraftKey("a", { kind: "reply", threadId: "1" })).not.toBe(forumDraftKey("a", { kind: "thread", boardId: "general_discussion" }));
  });
  it("mirrors the database poll rules", () => {
    const poll = { question: "Which ship?", options: ["Sloop", "Brig", "Galleon"], max_choices: 2, days: null };
    expect(validForumPoll(poll)).toBe(true);
    expect(validForumPoll({ ...poll, days: gameplay.forum.pollMaxDays })).toBe(true);
    for (const bad of [{ ...poll, options: ["Sloop"] }, { ...poll, options: ["Sloop", "sloop"] }, { ...poll, max_choices: 4 }, { ...poll, max_choices: 0 },
      { ...poll, max_choices: 1.5 }, { ...poll, days: 0 }, { ...poll, days: gameplay.forum.pollMaxDays + 1 }, { ...poll, question: " Padded" }, { ...poll, question: "" },
      { ...poll, options: [...poll.options, ""] }, { ...poll, extra: true }, { ...poll, options: Array.from({ length: gameplay.forum.pollOptionsMax + 1 }, (_, index) => "Option " + index) },
      { ...poll, question: "x".repeat(gameplay.forum.pollQuestionMaxLength + 1) }, null, "poll"]) expect(validForumPoll(bad)).toBe(false);
    expect(normalizeForumPoll({ question: " Which? ", options: [" A ", "B "], max_choices: 1, days: 3 })).toEqual({ question: "Which?", options: ["A", "B"], max_choices: 1, days: 3 });
    // A crafted request gets the poll error instead of a crash.
    for (const crafted of [{}, { question: 5, options: "A" }, { question: "Q", options: [1, " B "] }, [], "poll"]) expect(validForumPoll(normalizeForumPoll(crafted))).toBe(false);
    expect(forumPollDurations.every(days => days <= gameplay.forum.pollMaxDays)).toBe(true);
  });
  it("mirrors the database signature rules", () => {
    expect(validForumSignature("")).toBe(true);
    expect(validForumSignature("[b]Captain[/b]\nFair winds")).toBe(true);
    for (const bad of [" padded", "x".repeat(gameplay.forum.signatureMaxLength + 1), Array.from({ length: gameplay.forum.signatureMaxLines + 1 }, () => "line").join("\n"),
      "bell\u0007", "tab\there", 5]) expect(validForumSignature(bad)).toBe(false);
  });
});

describe("forum markup", () => {
  it("formats the supported tags", () => {
    expect(parseForumMarkup("[b]Bold[/b] and [I]italic[/I]")).toEqual([
      { type: "bold", children: [{ type: "text", text: "Bold" }] }, { type: "text", text: " and " }, { type: "italic", children: [{ type: "text", text: "italic" }] },
    ]);
    expect(parseForumMarkup("[spoiler][u][s]x[/s][/u][/spoiler]")).toEqual([
      { type: "spoiler", children: [{ type: "underline", children: [{ type: "strike", children: [{ type: "text", text: "x" }] }] }] },
    ]);
  });
  it("keeps unfinished, unknown or crossing tags as text", () => {
    expect(parseForumMarkup("[b]open")).toEqual([{ type: "text", text: "[b]open" }]);
    expect(parseForumMarkup("[/b] [quote]x[/quote] [b=1]y[/b]")).toEqual([{ type: "text", text: "[/b] [quote]x[/quote] [b=1]y[/b]" }]);
    expect(parseForumMarkup("[b][i]x[/b][/i]")).toEqual([{ type: "bold", children: [{ type: "text", text: "[i]x" }] }, { type: "text", text: "[/i]" }]);
    expect(parseForumMarkup("<script>alert(1)</script>")).toEqual([{ type: "text", text: "<script>alert(1)</script>" }]);
    const deep = "[b]".repeat(20) + "x" + "[/b]".repeat(20);
    expect(JSON.stringify(parseForumMarkup(deep))).toContain("[b]");
  });
  it("links only safe addresses", () => {
    expect(parseForumMarkup("[url=https://example.com/a?b=1]Site[/url]")).toEqual([{ type: "link", href: "https://example.com/a?b=1", internal: false, children: [{ type: "text", text: "Site" }] }]);
    expect(parseForumMarkup("[url]https://example.com[/url]")[0]).toMatchObject({ type: "link", href: "https://example.com/" });
    expect(parseForumMarkup("[url=/players/100001]Profile[/url]")[0]).toMatchObject({ type: "link", href: "/players/100001", internal: true });
    for (const target of ["javascript:alert(1)", "JAVASCRIPT:alert(1)", "data:text/html,x", "//evil.example", "/\\evil.example", "https://user:pw@example.com", "ftp://example.com", "https://exa mple.com"]) {
      expect(forumLinkTarget(target)).toBeNull();
      expect(parseForumMarkup("[url=" + target + "]x[/url]").some(node => node.type === "link" && JSON.stringify(node.children) === '[{"type":"text","text":"x"}]')).toBe(false);
    }
    expect(parseForumMarkup("[url=https://a.example][url=https://b.example]x[/url][/url]").filter(node => node.type === "link")).toHaveLength(1);
  });
  it("autolinks bare addresses without trailing punctuation", () => {
    expect(parseForumMarkup("See https://example.com/page.")).toEqual([
      { type: "text", text: "See " }, { type: "link", href: "https://example.com/page", internal: false, children: [{ type: "text", text: "https://example.com/page" }] }, { type: "text", text: "." },
    ]);
    expect(parseForumMarkup("(https://en.wikipedia.org/wiki/Ship_(sailing))")[1]).toMatchObject({ href: "https://en.wikipedia.org/wiki/Ship_(sailing)" });
    expect(parseForumMarkup("[b]https://example.com[/b]")[0]).toMatchObject({ type: "bold", children: [{ type: "link" }] });
  });
  it("turns posts into plain excerpts that keep spoilers hidden", () => {
    expect(plainForumText("[b]Fair[/b]  winds\n[spoiler]the ending[/spoiler] [url=https://example.com]charts[/url]")).toBe("Fair winds [spoiler] charts");
  });
  it("wraps the selected text for the toolbar", () => {
    expect(wrapForumSelection("Hello world", 6, 11, "[b]", "[/b]")).toEqual({ text: "Hello [b]world[/b]", start: 9, end: 14 });
  });
  it("shows only well-formed image tags", () => {
    const other = "f0f00000-0000-4000-8000-0000000000b2";
    expect(parseForumMarkup("Look [IMG=The harbor]" + id.toUpperCase() + "[/img] here")).toEqual([
      { type: "text", text: "Look " }, { type: "image", id, alt: "The harbor" }, { type: "text", text: " here" },
    ]);
    expect(parseForumMarkup("[spoiler][img]" + id + "[/img][/spoiler]")).toEqual([{ type: "spoiler", children: [{ type: "image", id, alt: "" }] }]);
    for (const text of ["[img]https://evil.example/x.png[/img]", "[img]" + id + "[/IMG ]", "[img]" + id, "[/img]", "[img=" + "x".repeat(201) + "]" + id + "[/img]"]) {
      expect(parseForumMarkup(text).some(node => node.type === "image")).toBe(false);
    }
    expect(parseForumMarkup("[url][img]" + id + "[/img][/url]").some(node => node.type === "link")).toBe(false);
    expect(parseForumMarkup("[url=https://example.com][img]" + id + "[/img][/url]")).toEqual([
      { type: "link", href: "https://example.com/", internal: false, children: [{ type: "image", id, alt: "" }] },
    ]);
    expect(forumImageIds("[img]" + id + "[/img] [b][img]" + other + "[/img][/b] [img]" + id + "[/img]")).toEqual([id, other]);
    expect(plainForumText("Map: [img]" + id + "[/img]")).toBe("Map: [image]");
  });
  it("inserts uploaded images on their own line", () => {
    expect(insertForumImage("Before after", 6, id)).toEqual({ text: "Before\n[img]" + id + "[/img]\n after", position: 7 + 47 + 1 });
    expect(insertForumImage("", 0, id).text).toBe("[img]" + id + "[/img]\n");
    expect(insertForumImage("Line\n", 5, id).text).toBe("Line\n[img]" + id + "[/img]\n");
  });
});

describe("forum server actions", () => {
  it("refuses stale accounts before touching the database", async () => {
    mocks.requireCharacter.mockResolvedValue({ id: "new-character" });
    expect(await submitForumPost("old-character", { id, kind: "thread", boardId: "general_discussion", title: "Title", body: "Body", poll: null })).toMatchObject({ retry: true });
    expect((await withdrawForumPost("old-character", "1")).error).toContain("changed");
    expect(await markForumThreadRead("old-character", "1", 1)).toContain("changed");
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
  it("sends normalized posts and reports the cooldown", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "FORUM_COOLDOWN", details: "12" } });
    const result = await submitForumPost("captain", { id, kind: "reply", threadId: "5", body: "  Hello\r\n", quotedPostId: null });
    expect(mocks.rpc).toHaveBeenCalledWith("create_forum_post", { thread_id: "5", post_body: "Hello", quoted_post_id: null, request_id: id });
    expect(result).toEqual({ error: "Please wait 12 seconds before posting again.", retry: false });
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "unexpected" } });
    expect(await submitForumPost("captain", { id, kind: "reply", threadId: "5", body: "Hello", quotedPostId: null })).toMatchObject({ retry: true });
  });
  it("rejects invalid input without a database call", async () => {
    expect((await submitForumPost("captain", { id, kind: "thread", boardId: "Bad board", title: "Title", body: "Body", poll: null })).error).toBeTruthy();
    expect((await submitForumPost("captain", { id, kind: "thread", boardId: "general_discussion", title: "Title", body: "Body",
      poll: { question: "Pick", options: ["A", "a"], max_choices: 1, days: null } })).error).toContain("poll");
    expect((await editForumPost("captain", "1", "Body", null, -1)).error).toBeTruthy();
    expect((await moderateForum("captain", { id, action: "remove_post", payload: { thread_id: "1" }, reason: "Spam" })).error).toBeTruthy();
    expect((await moderateForum("captain", { id, action: "pin_thread", payload: { thread_id: "1" }, reason: "x" })).error).toBeTruthy();
    expect((await moderateForum("captain", { id, action: "move_thread", payload: { thread_id: "1", board_id: "../x" }, reason: "Moving" })).error).toBeTruthy();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("validates reactions and subscriptions before the database", async () => {
    expect((await setForumReaction("captain", "0", 1)).error).toBeTruthy();
    expect((await setForumReaction("captain", "1", 2 as never)).error).toBeTruthy();
    expect(await setForumSubscription("captain", "x", true)).toBeTruthy();
    expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "NEW_CHARACTER" } });
    expect((await setForumReaction("captain", "1", -1)).error).toContain("hours");
    mocks.rpc.mockResolvedValueOnce({ data: { post_id: "1", likes: 1, dislikes: 0, reaction: 1 }, error: null });
    expect((await setForumReaction("captain", "1", 1)).receipt?.likes).toBe(1);
  });
  it("validates reports, bans and moderator roles before the database", async () => {
    expect((await reportForumPost("captain", "1", "bribery" as never, "")).error).toBeTruthy();
    expect((await reportForumPost("captain", "1", "spam", "x".repeat(501))).error).toBeTruthy();
    expect((await moderateForum("captain", { id, action: "ban_player", payload: { player_number: "100001", hours: "5" }, reason: "Spam" })).error).toBeTruthy();
    expect((await moderateForum("captain", { id, action: "ban_player", payload: { player_number: "12" }, reason: "Spam" })).error).toBeTruthy();
    expect((await moderateForum("captain", { id, action: "grant_moderator", payload: { player_number: "100001", hours: "24" }, reason: "Helper" })).error).toBeTruthy();
    expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "FORUM_FORBIDDEN" } });
    expect((await moderateForum("captain", { id, action: "ban_player", payload: { player_number: "100001", hours: "24" }, reason: "Spam" })).error).toContain("cannot act on");
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "FORUM_BANNED", details: "2026-09-26T12:00:00Z" } });
    expect((await setForumReaction("captain", "1", 1)).error).toBe("You are banned from posting in the forums until Sat, 26 Sep 2026 12:00:00 GMT.");
    mocks.rpc.mockResolvedValueOnce({ data: { report_id: "4", already: false }, error: null });
    await reportForumPost("captain", "1", "spam", "  Repeats  ");
    expect(mocks.rpc).toHaveBeenLastCalledWith("report_forum_post", { post_id: "1", reason: "spam", note: "Repeats" });
  });
  it("trims moderator edits and reasons", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { message: "Post edited.", thread_id: "1", post_id: "2" }, error: null });
    await moderateForum("captain", { id, action: "edit_post", payload: { post_id: "2", body: " Clean \r\n", title: " Title " }, reason: "  Removed details  " });
    expect(mocks.rpc).toHaveBeenCalledWith("moderate_forum", { action: "edit_post", payload: { post_id: "2", body: "Clean", title: "Title" }, request_id: id, reason: "Removed details" });
  });
});

describe("forum stage four actions", () => {
  it("sends trimmed polls and delivers reply notices after the response", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { thread_id: "7", post_id: "9", post_number: 1, created_at: "2026-09-25T12:00:00Z" }, error: null });
    await submitForumPost("captain", { id, kind: "thread", boardId: "general_discussion", title: "Title", body: "Body",
      poll: { question: " Which ship? ", options: [" Sloop", "Brig "], max_choices: 1, days: 3 } });
    expect(mocks.rpc).toHaveBeenCalledWith("create_forum_thread", { board_id: "general_discussion", thread_title: "Title", post_body: "Body", request_id: id,
      poll: { question: "Which ship?", options: ["Sloop", "Brig"], max_choices: 1, days: 3 } });
    expect(mocks.after).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValueOnce({ data: { thread_id: "7", post_id: "10", post_number: 2, created_at: "2026-09-25T12:00:00Z" }, error: null });
    await submitForumPost("captain", { id, kind: "reply", threadId: "7", body: "Reply", quotedPostId: null });
    expect(mocks.after).toHaveBeenCalledTimes(1);
    mocks.rpc.mockResolvedValueOnce({ data: 0, error: null });
    await mocks.after.mock.calls[0][0]();
    expect(mocks.rpc).toHaveBeenLastCalledWith("deliver_forum_notifications");
  });
  it("validates votes, poll closing and settings before the database", async () => {
    for (const choices of [[0], [1.5], Array.from({ length: gameplay.forum.pollOptionsMax + 1 }, (_, index) => index + 1), "1" as never]) {
      expect((await voteForumPoll("captain", "1", choices)).error).toBeTruthy();
    }
    expect((await voteForumPoll("captain", "x", [1])).error).toBeTruthy();
    expect((await closeForumPoll("captain", "0")).error).toBeTruthy();
    expect((await saveForumSettings("captain", "x".repeat(gameplay.forum.signatureMaxLength + 1), true)).error).toBeTruthy();
    expect((await saveForumSettings("captain", "", "yes" as never)).error).toBeTruthy();
    expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "NEW_CHARACTER" } });
    expect((await voteForumPoll("captain", "1", [2])).error).toBe(`New captains can vote after ${gameplay.forum.newCharacterHours} hours.`);
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "POLL_CLOSED" } });
    expect((await voteForumPoll("captain", "1", [2])).error).toBe("This poll is closed.");
    mocks.rpc.mockResolvedValueOnce({ data: { signature: "Hi", show_signatures: true, ban: null, can_sign: true }, error: null });
    await saveForumSettings("captain", "  Hi\r\n", true);
    expect(mocks.rpc).toHaveBeenLastCalledWith("set_forum_settings", { signature: "Hi", show_signatures: true });
  });
  it("checks image, poll and signature moderation payloads", async () => {
    expect((await moderateForum("captain", { id, action: "remove_image", payload: { image_id: "not-a-uuid" }, reason: "Graphic" })).error).toBeTruthy();
    expect((await moderateForum("captain", { id, action: "close_poll", payload: { post_id: "1" }, reason: "Enough" })).error).toBeTruthy();
    expect((await moderateForum("captain", { id, action: "clear_signature", payload: { player_number: "12" }, reason: "Advert" })).error).toBeTruthy();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("deletes a purged file after the database logs the purge", async () => {
    const receipt = { message: "Image file deleted.", thread_id: "1", post_id: "2", image_path: "u/" + id + ".webp" };
    mocks.rpc.mockResolvedValueOnce({ data: receipt, error: null });
    mocks.remove.mockResolvedValueOnce({ data: [], error: { message: "offline" } });
    expect(await moderateForum("captain", { id, action: "purge_image", payload: { image_id: id }, reason: "Illegal content" })).toMatchObject({ retry: true });
    mocks.rpc.mockResolvedValueOnce({ data: receipt, error: null });
    mocks.remove.mockResolvedValueOnce({ data: [], error: null });
    expect(await moderateForum("captain", { id, action: "purge_image", payload: { image_id: id }, reason: "Illegal content" })).toEqual({ receipt });
    expect(mocks.remove).toHaveBeenLastCalledWith([receipt.image_path]);
  });
});
