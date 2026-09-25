import { test, expect } from "@playwright/test";
import { createTestAccount, cleanupTestAccounts, loginTestAccount, testSql } from "../support/accounts";
import { cleanupForumThreads, resetForumCooldown } from "../support/forum";

test("captains react, follow threads through notifications and find posts by author", async ({ page, browser, baseURL }) => {
  const author = await createTestAccount("forum-follow"), reader = await createTestAccount("forum-fan");
  // Only the reader is old enough to dislike.
  testSql("update public.characters set created_at=clock_timestamp()-interval '3 days' where id='" + reader.id + "';");
  const context = await browser.newContext({ baseURL }), second = await context.newPage();
  const title = "Trade winds " + author.name;
  try {
    const created = await author.api.rpc("create_forum_thread", { board_id: "general_discussion", thread_title: title, post_body: "Where do the best winds blow?", request_id: crypto.randomUUID() });
    expect(created.error).toBeNull();
    const threadId = created.data!.thread_id;
    resetForumCooldown([author.id]);
    await loginTestAccount(page, author);

    await loginTestAccount(second, reader);
    await second.goto("/forums/threads/" + threadId);
    const reactions = second.getByRole("group", { name: "Reactions to post #1", exact: true });
    await reactions.getByRole("button", { name: "Like (0)", exact: true }).click();
    await expect(reactions.getByRole("button", { name: "Like (1)", exact: true })).toHaveAttribute("aria-pressed", "true");
    await reactions.getByRole("button", { name: "Dislike (0)", exact: true }).click();
    await expect(reactions.getByRole("button", { name: "Dislike (1)", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(reactions.getByRole("button", { name: "Like (0)", exact: true })).toHaveAttribute("aria-pressed", "false");
    await reactions.getByRole("button", { name: "Dislike (1)", exact: true }).click();
    await reactions.getByRole("button", { name: "Like (0)", exact: true }).click();
    await expect(reactions.getByRole("button", { name: "Like (1)", exact: true })).toHaveAttribute("aria-pressed", "true");
    await second.getByLabel("Your reply", { exact: true }).fill("The northern route, every time.");
    await second.getByRole("button", { name: "Post reply", exact: true }).click();
    await expect(second.locator("#post-2 .o-forum-post-main > .o-forum-body")).toHaveText("The northern route, every time.");
    await expect(second.getByRole("button", { name: "Unsubscribe", exact: true })).toBeVisible();

    await expect(page.getByRole("link", { name: "Notifications, 1 unread", exact: true })).toBeVisible({ timeout: 20000 });
    await page.getByRole("link", { name: "Notifications, 1 unread", exact: true }).click();
    await expect(page.locator(".o-notification-list")).toContainText(reader.name + " replied in “" + title + "”");
    await page.getByRole("link", { name: "View forum post", exact: true }).click();
    await expect(page).toHaveURL(new RegExp("/forums/threads/" + threadId + "#post-2$"));
    const reply = page.getByRole("group", { name: "Reactions to post #2", exact: true });
    await expect(reply.getByRole("button", { name: /^Dislike/ })).toBeDisabled();
    await expect(reply.getByRole("button", { name: /^Dislike/ })).toHaveAttribute("title", /New captains can dislike posts after/);
    await reply.getByRole("button", { name: "Like (0)", exact: true }).click();
    await expect(reply.getByRole("button", { name: "Like (1)", exact: true })).toBeVisible();
    await expect(page.getByRole("group", { name: "Reactions to post #1", exact: true }).getByRole("button", { name: "Like (1)", exact: true })).toBeDisabled();

    resetForumCooldown([reader.id]);
    const quoted = await reader.api.rpc("create_forum_post", { thread_id: threadId, post_body: "Quoting the question.", quoted_post_id: created.data!.post_id, request_id: crypto.randomUUID() });
    expect(quoted.error).toBeNull();
    // The app delivers reply notices right after a reply; a direct call does the same step itself.
    expect((await reader.api.rpc("deliver_forum_notifications")).error).toBeNull();
    await page.goto("/forums/subscriptions");
    const row = page.locator(".o-forum-results li", { hasText: title });
    await expect(row).toContainText("1 new");
    await page.goto("/notifications");
    await expect(page.locator(".o-notification-list")).toContainText(reader.name + " quoted your post in “" + title + "”");
    await page.goto("/forums/boards/general_discussion");
    await expect(page.locator("tr", { hasText: title }).locator('td[data-label="Rating"]')).toHaveText("+1");

    await page.goto("/forums/threads/" + threadId);
    await page.getByRole("button", { name: "Unsubscribe", exact: true }).click();
    await expect(page.getByRole("button", { name: "Subscribe", exact: true })).toHaveAttribute("aria-pressed", "false");
    await page.goto("/forums/subscriptions");
    await expect(page.getByText("You are not subscribed to any threads.", { exact: true })).toBeVisible();

    await page.goto("/forums");
    await page.getByRole("textbox", { name: "Search the forums", exact: true }).fill("northern by:" + reader.name);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page).toHaveURL(/\/forums\/search\?q=/);
    await expect(page.locator(".o-forum-content").getByRole("status")).toHaveText("1 result");
    await expect(page.locator(".o-forum-results")).toContainText("The northern route, every time.");
    await page.goto("/players/" + reader.playerNumber);
    await page.getByRole("link", { name: "Forum posts: 2", exact: true }).click();
    await expect(page.locator(".o-forum-content").getByRole("status")).toHaveText("2 results");
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "search at " + width + "px").toBe(true);
    }
    await page.screenshot({ path: ".local/forum-search-mobile.png", fullPage: true });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/forums/threads/" + threadId);
    await page.screenshot({ path: ".local/forum-reactions-desktop.png", fullPage: true });
  } finally { await context.close(); cleanupForumThreads([author.id, reader.id]); await cleanupTestAccounts([author, reader]); }
});
