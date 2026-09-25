import { beforeEach, describe, expect, it, vi } from "vitest";
import { gameplay } from "../../src/config/public";
import { forumBoardUrl, forumDraftKey, forumPostUrl, forumThreadUrl, isForumBoardId, isForumId, isForumPath, normalizeForumBody, parseForumPage,
  parsePendingForumPost, validForumBody, validForumTitle, validModerationReason } from "../../src/lib/forums";
import { forumLinkTarget, parseForumMarkup, wrapForumSelection } from "../../src/lib/forum-markup";
import { isHospitalAccessiblePath } from "../../src/lib/hospital";
import { isSeaAccessiblePath } from "../../src/lib/sea-travel";
import { navigationRedirect } from "../../src/lib/game-navigation";

const mocks = vi.hoisted(() => ({ requireCharacter: vi.fn(), createClient: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/player", () => ({ requireCharacter: mocks.requireCharacter }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { editForumPost, markForumThreadRead, moderateForum, submitForumPost, withdrawForumPost } from "../../src/app/forum-actions";

const id = "f0f00000-0000-4000-8000-0000000000a1";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCharacter.mockResolvedValue({ id: "captain" });
  mocks.createClient.mockResolvedValue({ rpc: mocks.rpc });
});

describe("forum routes and values", () => {
  it("accepts exact forum paths in Hospital and at sea", () => {
    for (const path of ["/forums", "/forums/boards/general_discussion", "/forums/boards/trading_post/new", "/forums/threads/9223372036854775807", "/forums/posts/1"]) {
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
    const thread = { id, kind: "thread", boardId: "general_discussion", title: "Title", body: "Body" };
    const reply = { id, kind: "reply", threadId: "12", body: "Body", quotedPostId: "3" };
    expect(parsePendingForumPost(JSON.stringify(thread))).toEqual(thread);
    expect(parsePendingForumPost(JSON.stringify(reply))).toEqual(reply);
    expect(parsePendingForumPost(null)).toBeNull();
    for (const bad of [{ ...thread, title: "" }, { ...reply, threadId: "x" }, { ...reply, quotedPostId: 3 }, { ...thread, kind: "other" }, { ...thread, id: "bad" }]) {
      expect(() => parsePendingForumPost(JSON.stringify(bad))).toThrow();
    }
    expect(forumDraftKey("a", { kind: "reply", threadId: "1" })).not.toBe(forumDraftKey("b", { kind: "reply", threadId: "1" }));
    expect(forumDraftKey("a", { kind: "reply", threadId: "1" })).not.toBe(forumDraftKey("a", { kind: "thread", boardId: "general_discussion" }));
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
  it("wraps the selected text for the toolbar", () => {
    expect(wrapForumSelection("Hello world", 6, 11, "[b]", "[/b]")).toEqual({ text: "Hello [b]world[/b]", start: 9, end: 14 });
  });
});

describe("forum server actions", () => {
  it("refuses stale accounts before touching the database", async () => {
    mocks.requireCharacter.mockResolvedValue({ id: "new-character" });
    expect(await submitForumPost("old-character", { id, kind: "thread", boardId: "general_discussion", title: "Title", body: "Body" })).toMatchObject({ retry: true });
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
    expect((await submitForumPost("captain", { id, kind: "thread", boardId: "Bad board", title: "Title", body: "Body" })).error).toBeTruthy();
    expect((await editForumPost("captain", "1", "Body", null, -1)).error).toBeTruthy();
    expect((await moderateForum("captain", { id, action: "remove_post", payload: { thread_id: "1" }, reason: "Spam" })).error).toBeTruthy();
    expect((await moderateForum("captain", { id, action: "pin_thread", payload: { thread_id: "1" }, reason: "x" })).error).toBeTruthy();
    expect((await moderateForum("captain", { id, action: "move_thread", payload: { thread_id: "1", board_id: "../x" }, reason: "Moving" })).error).toBeTruthy();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("trims moderator edits and reasons", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { message: "Post edited.", thread_id: "1", post_id: "2" }, error: null });
    await moderateForum("captain", { id, action: "edit_post", payload: { post_id: "2", body: " Clean \r\n", title: " Title " }, reason: "  Removed details  " });
    expect(mocks.rpc).toHaveBeenCalledWith("moderate_forum", { action: "edit_post", payload: { post_id: "2", body: "Clean", title: "Title" }, request_id: id, reason: "Removed details" });
  });
});
