import { test, expect, type Page } from "@playwright/test";
import { gameplay } from "../../src/config/public";
import { createTestAccount, cleanupTestAccounts, loginTestAccount, testSql } from "../support/accounts";
import { cleanupForumThreads, resetForumCooldown } from "../support/forum";

type Account = Awaited<ReturnType<typeof createTestAccount>>;
async function startThread(account: Account, boardId: string, title: string, body: string) {
  const result = await account.api.rpc("create_forum_thread", { board_id: boardId, thread_title: title, post_body: body, request_id: crypto.randomUUID() });
  expect(result.error).toBeNull();
  resetForumCooldown([account.id]);
  return result.data!;
}
async function reply(account: Account, threadId: string, body: string) {
  const result = await account.api.rpc("create_forum_post", { thread_id: threadId, post_body: body, quoted_post_id: null, request_id: crypto.randomUUID() });
  expect(result.error).toBeNull();
  resetForumCooldown([account.id]);
  return result.data!;
}
async function withoutSidewaysScroll(page: Page, name: string) {
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), name + " at " + width + "px").toBe(true);
  }
  await page.screenshot({ path: ".local/forum-" + name + "-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
}

test("captains start threads, quote, edit and delete posts, and follow unread posts across pages", async ({ page, browser, baseURL }) => {
  const author = await createTestAccount("forum-author"), reader = await createTestAccount("forum-reader");
  const context = await browser.newContext({ baseURL }), second = await context.newPage();
  const title = "Harbor gossip " + author.name;
  try {
    await loginTestAccount(page, author);
    await page.getByRole("link", { name: "Forums", exact: true }).click();
    await expect(page).toHaveURL(/\/forums$/);
    await expect(page.getByRole("link", { name: "Forums", exact: true })).toHaveAttribute("aria-current", "page");
    await page.getByRole("link", { name: "General Discussion", exact: true }).click();
    await page.getByRole("link", { name: "New thread", exact: true }).click();
    await page.getByLabel("Title", { exact: true }).fill(title);
    const body = "[b]Fair winds[/b] to all!\n<script>window.forumInjected = true</script>\nCharts: https://example.com/charts.";
    await page.getByLabel("Opening post", { exact: true }).fill(body);
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await expect(page.locator(".o-forum-preview strong")).toHaveText("Fair winds");
    await page.getByRole("button", { name: "Write", exact: true }).click();
    await page.getByRole("button", { name: "Create thread", exact: true }).click();
    await expect(page).toHaveURL(/\/forums\/threads\/\d+$/);
    const threadId = new URL(page.url()).pathname.split("/").at(-1)!;
    const opening = page.locator("#post-1");
    await expect(opening.locator(".o-forum-body strong")).toHaveText("Fair winds");
    await expect(opening.locator(".o-forum-body")).toContainText("<script>window.forumInjected = true</script>");
    expect(await page.evaluate(() => "forumInjected" in window)).toBe(false);
    await expect(opening.getByRole("link", { name: "https://example.com/charts", exact: true })).toHaveAttribute("rel", "nofollow ugc noopener noreferrer");
    await page.screenshot({ path: ".local/forum-thread-desktop.png", fullPage: true });

    await loginTestAccount(second, reader);
    await second.goto("/forums/boards/general_discussion");
    const row = second.locator("tr", { hasText: title });
    await expect(row.getByRole("link", { name: "First unread post in " + title, exact: true })).toBeVisible();
    await row.getByRole("link", { name: title, exact: true }).click();
    await second.locator("#post-1").getByRole("button", { name: "Quote", exact: true }).click();
    await expect(second.getByText("Quoting #1 by " + author.name, { exact: true })).toBeVisible();
    await second.getByLabel("Your reply", { exact: true }).fill("Aye, fair winds indeed.");
    await second.getByRole("button", { name: "Post reply", exact: true }).click();
    await expect(second.locator("#post-2 .o-forum-quote")).toContainText("Quote from " + author.name);
    await expect(second.locator("#post-2 .o-forum-post-main > .o-forum-body")).toHaveText("Aye, fair winds indeed.");
    await expect(second.getByText("Quoting #1 by " + author.name, { exact: true })).toHaveCount(0);

    await page.goto("/forums/boards/general_discussion");
    await page.locator("tr", { hasText: title }).getByRole("link", { name: "First unread post in " + title, exact: true }).click();
    await expect(page).toHaveURL(new RegExp("/forums/threads/" + threadId + "#post-2$"));
    await expect.poll(async () => (await author.api.rpc("get_forum_board", { board_id: "general_discussion" })).data?.items.find(item => item.id === threadId)?.unread).toBe(false);

    await opening.getByRole("button", { name: "Edit", exact: true }).click();
    await opening.getByLabel("Post", { exact: true }).fill("Fair winds, updated.");
    await opening.getByRole("button", { name: "Save post", exact: true }).click();
    await expect(page.getByText("Post saved.", { exact: true })).toBeVisible();
    await expect(opening.locator(".o-forum-edited")).toContainText("Last edited by " + author.name);
    await expect(page.locator("#post-2 .o-forum-quote")).toContainText("(edited since)");

    await second.reload();
    await second.locator("#post-2").getByRole("button", { name: "Delete", exact: true }).click();
    await second.getByRole("dialog").getByRole("button", { name: "Delete post", exact: true }).click();
    await expect(second.getByText("Your post was deleted.", { exact: true })).toBeVisible();
    await expect(second.locator("#post-2")).toContainText("This post was deleted by its author.");
    await expect(second.locator("#post-2")).not.toContainText("Aye, fair winds indeed.");
    await expect(second.locator("#post-2 .o-forum-author")).toHaveText("[deleted]");
    await page.reload();
    await expect(page.locator("#post-2 .o-forum-author")).toHaveText("[deleted]");
    await expect(page.locator("#post-2")).not.toContainText(reader.name);

    resetForumCooldown([author.id]);
    let last = null as Awaited<ReturnType<typeof reply>> | null;
    for (let index = 0; index < gameplay.forum.postsPageSize; index++) last = await reply(author, threadId, "Log entry " + index);
    await page.goto("/forums/posts/" + last!.post_id);
    await expect(page).toHaveURL(new RegExp("/forums/threads/" + threadId + "\\?page=2#post-" + last!.post_number + "$"));
    await expect(page.locator("#post-" + last!.post_number)).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Thread pages" }).first().getByRole("link", { name: "Page 1", exact: true })).toBeVisible();
    await withoutSidewaysScroll(page, "thread");
    await page.goto("/forums");
    await expect(page.getByRole("link", { name: "General Discussion", exact: true })).toBeVisible();
    await withoutSidewaysScroll(page, "index");
    await page.goto("/forums/boards/general_discussion");
    await withoutSidewaysScroll(page, "board");
  } finally { await context.close(); cleanupForumThreads([author.id, reader.id]); await cleanupTestAccounts([author, reader]); }
});

test("a lost response retries the same thread, and the forum stays open in Hospital and during travel", async ({ page, browser, baseURL }) => {
  const captain = await createTestAccount("forum-retry"), sailor = await createTestAccount("forum-sailor");
  const context = await browser.newContext({ baseURL }), traveling = await context.newPage();
  const title = "Retry " + captain.name;
  try {
    await loginTestAccount(page, captain);
    await page.goto("/forums/boards/off_topic/new");
    let intercepted = false;
    await page.route("**/forums/boards/off_topic/new", async route => {
      if (route.request().method() !== "POST" || intercepted) { await route.continue(); return; }
      intercepted = true;
      await route.fetch(); await route.abort("failed");
    });
    await page.getByLabel("Title", { exact: true }).fill(title);
    await page.getByLabel("Opening post", { exact: true }).fill("Posted exactly once.");
    await page.getByRole("button", { name: "Create thread", exact: true }).click();
    await expect(page.getByRole("button", { name: "Retry post", exact: true })).toBeVisible();
    await page.unroute("**/forums/boards/off_topic/new");
    await page.reload();
    await expect(page.getByRole("button", { name: "Retry post", exact: true })).toBeVisible();
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue(title);
    await page.getByRole("button", { name: "Retry post", exact: true }).click();
    await expect(page).toHaveURL(/\/forums\/threads\/\d+$/);
    const threadId = new URL(page.url()).pathname.split("/").at(-1)!;
    expect(testSql("select count(*) from private.forum_threads where author_id='" + captain.id + "';").trim()).toBe("1");

    testSql("update public.characters set crew_health=0 where id='" + captain.id + "';");
    resetForumCooldown([captain.id]);
    await page.goto("/forums/threads/" + threadId);
    await expect(page).toHaveURL(new RegExp("/forums/threads/" + threadId + "$"));
    await expect(page.getByRole("navigation", { name: "Harbor locations", exact: true }).getByRole("link", { name: "Forums", exact: true })).toBeVisible();
    await page.getByLabel("Your reply", { exact: true }).fill("Writing from Hospital.");
    await page.getByRole("button", { name: "Post reply", exact: true }).click();
    await expect(page.locator("#post-2 .o-forum-post-main > .o-forum-body")).toHaveText("Writing from Hospital.");

    await loginTestAccount(traveling, sailor);
    const state = await sailor.api.rpc("get_game_state");
    expect((await sailor.api.rpc("depart_harbor", { expected_version: state.data!.sea.version, request_id: crypto.randomUUID() })).error).toBeNull();
    await traveling.goto("/forums/threads/" + threadId);
    await expect(traveling).toHaveURL(new RegExp("/forums/threads/" + threadId + "$"));
    await traveling.getByLabel("Your reply", { exact: true }).fill("Writing while traveling.");
    await traveling.getByRole("button", { name: "Post reply", exact: true }).click();
    await expect(traveling.locator("#post-3 .o-forum-post-main > .o-forum-body")).toHaveText("Writing while traveling.");
  } finally { await context.close(); cleanupForumThreads([captain.id, sailor.id]); await cleanupTestAccounts([captain, sailor]); }
});

test("moderators pin, lock, edit, move, retire, remove and restore with logged reasons", async ({ page, browser, baseURL }) => {
  const admin = await createTestAccount("forum-moderator"), player = await createTestAccount("forum-player");
  testSql("insert into private.admin_members(user_id) values('" + admin.userId + "');");
  const context = await browser.newContext({ baseURL }), playing = await context.newPage();
  const title = "Idea " + player.name;
  try {
    const thread = await startThread(player, "suggestions", title, "More ships please.");
    const answer = await reply(player, thread.thread_id, "And bigger cannons.");
    await loginTestAccount(page, admin);
    await page.goto("/forums/threads/" + thread.thread_id);
    const confirmWith = async (button: string, notice: string, board?: string) => {
      const dialog = page.getByRole("dialog");
      if (board) await dialog.getByLabel("Move to", { exact: true }).selectOption(board);
      await dialog.getByLabel("Reason (visible to moderators)", { exact: true }).fill("Test reason: " + notice);
      await dialog.getByRole("button", { name: button, exact: true }).click();
      await expect(page.getByText(notice, { exact: true })).toBeVisible();
    };
    const moderate = async (action: string, button: string, notice: string, board?: string) => {
      await page.getByRole("group", { name: "Moderation", exact: true }).getByRole("button", { name: action, exact: true }).click();
      await confirmWith(button, notice, board);
    };
    await moderate("Pin", "Pin", "Thread pinned.");
    await moderate("Lock", "Lock", "Thread locked.");
    await page.screenshot({ path: ".local/forum-moderation.png", fullPage: true });

    await loginTestAccount(playing, player);
    await playing.goto("/forums/threads/" + thread.thread_id);
    await expect(playing.getByText("This thread is locked. Only moderators can reply.", { exact: true })).toBeVisible();
    await expect(playing.getByLabel("Your reply", { exact: true })).toHaveCount(0);
    await expect(playing.locator("#post-1").getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
    await expect(playing.getByRole("group", { name: "Moderation", exact: true })).toHaveCount(0);

    await page.locator("#post-2").getByRole("button", { name: "Remove", exact: true }).click();
    await confirmWith("Remove post", "Post removed.");
    await playing.reload();
    await expect(playing.locator("#post-2")).toContainText("This post was removed by a moderator.");
    await expect(playing.locator("#post-2")).not.toContainText("And bigger cannons.");
    await page.locator("#post-2").getByRole("button", { name: "Restore", exact: true }).click();
    await confirmWith("Restore post", "Post restored.");

    expect((await player.api.rpc("withdraw_forum_post", { post_id: answer.post_id })).error).toBeNull();
    await playing.reload();
    await expect(playing.locator("#post-2")).toContainText("This post was deleted by its author.");
    await expect(playing.locator("#post-2 .o-forum-author")).toHaveText("[deleted]");
    await expect(playing.locator("#post-2")).not.toContainText("And bigger cannons.");
    await page.reload();
    await expect(page.locator("#post-2")).toContainText("Hidden from players. Only moderators can read it.");
    await expect(page.locator("#post-2 .o-forum-removed-body")).toHaveText("And bigger cannons.");
    await expect(page.locator("#post-2 .o-forum-author")).toContainText(player.name);
    await expect(page.locator("#post-2").getByRole("button", { name: "Restore", exact: true })).toHaveCount(0);

    await page.locator("#post-1").getByRole("button", { name: "Moderator edit", exact: true }).click();
    await page.locator("#post-1").getByLabel("Post", { exact: true }).fill("More ships, please.");
    await page.locator("#post-1").getByLabel("Reason (visible to moderators)", { exact: true }).fill("Fixed punctuation");
    await page.locator("#post-1").getByRole("button", { name: "Save post", exact: true }).click();
    await expect(page.getByText("Post edited.", { exact: true })).toBeVisible();
    await expect(page.locator("#post-1 .o-forum-edited")).toContainText("Last edited by " + admin.name + " (moderator)");
    await page.locator("#post-1").getByRole("button", { name: "History", exact: true }).click();
    await expect(page.getByRole("dialog").getByText("More ships please.", { exact: true })).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Close dialog", exact: true }).click();

    await moderate("Move", "Move thread", "Thread moved to General Discussion.", "general_discussion");
    await moderate("Graveyard", "Move to graveyard", "Thread moved to Graveyard and locked.");
    await page.goto("/forums/boards/graveyard");
    await expect(page.locator("tr", { hasText: title })).toContainText("Locked");
    await page.goto("/forums/threads/" + thread.thread_id);
    await moderate("Remove", "Remove thread", "Thread removed.");
    await expect(page.getByText("A moderator removed this thread. Only moderators can open it.", { exact: true })).toBeVisible();
    await playing.goto("/forums/threads/" + thread.thread_id);
    await expect(playing.getByText("This board, thread or post is not available.", { exact: false })).toBeVisible();
    await moderate("Restore thread", "Restore thread", "Thread restored.");
    await playing.reload();
    await expect(playing.locator("#post-1 .o-forum-post-main > .o-forum-body")).toHaveText("More ships, please.");
    expect(testSql("select count(*) from private.forum_moderation_log where thread_id=" + thread.thread_id + " and actor_id='" + admin.id + "';").trim()).toBe("9");
  } finally { await context.close(); cleanupForumThreads([player.id, admin.id]); await cleanupTestAccounts([admin, player]); }
});
