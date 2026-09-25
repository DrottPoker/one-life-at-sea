import { test, expect, type Page } from "@playwright/test";
import { createTestAccount, cleanupTestAccounts, loginTestAccount, testSql } from "../support/accounts";
import { cleanupForumThreads, resetForumCooldown } from "../support/forum";

async function confirm(page: Page, button: string, notice: string | RegExp, reason: string, length?: string) {
  const dialog = page.getByRole("dialog");
  if (length) await dialog.getByLabel("Ban length", { exact: true }).selectOption({ label: length });
  await dialog.getByRole("textbox", { name: /^Reason/ }).fill(reason);
  await dialog.getByRole("button", { name: button, exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: notice })).toBeVisible();
}

test("players report and ignore, and moderators work the queue, ban, lift bans and appoint moderators", async ({ page, browser, baseURL }) => {
  const admin = await createTestAccount("forum-admin"), author = await createTestAccount("forum-reported"), reporter = await createTestAccount("forum-reporter"), helper = await createTestAccount("forum-helper");
  // Reports and karma need captains older than a day.
  testSql("insert into private.admin_members(user_id) values('" + admin.userId + "'); update public.characters set created_at=clock_timestamp()-interval '3 days' where id in('" +
    reporter.id + "','" + helper.id + "');");
  const reporting = await browser.newContext({ baseURL }), authoring = await browser.newContext({ baseURL });
  const second = await reporting.newPage(), third = await authoring.newPage();
  const title = "Heated debate " + author.name;
  try {
    const created = await author.api.rpc("create_forum_thread", { board_id: "general_discussion", thread_title: title, post_body: "This opening post is long enough to earn karma.", request_id: crypto.randomUUID() });
    expect(created.error).toBeNull();
    const threadId = created.data!.thread_id;
    resetForumCooldown([author.id]);

    await loginTestAccount(second, reporter);
    await second.goto("/forums/threads/" + threadId);
    await second.getByRole("group", { name: "Reactions to post #1", exact: true }).getByRole("button", { name: "Like (0)", exact: true }).click();
    await expect(second.locator("#post-1 .o-forum-author")).toContainText("Karma1");
    await second.locator("#post-1").getByRole("button", { name: "Report", exact: true }).click();
    const report = second.getByRole("dialog");
    await report.getByLabel("Reason", { exact: true }).selectOption({ label: "Offensive content" });
    await report.getByLabel("Details (optional)", { exact: true }).fill("Insults other captains.");
    await report.getByRole("button", { name: "Send report", exact: true }).click();
    await expect(second.getByText("Thank you. The moderators will review this post.", { exact: true })).toBeVisible();
    await expect(second.locator("#post-1").getByRole("button", { name: "Reported", exact: true })).toBeDisabled();

    await loginTestAccount(page, admin);
    await page.goto("/admin");
    await page.getByRole("navigation", { name: "Administration", exact: true }).getByRole("link", { name: "Forum", exact: true }).click();
    await expect(page).toHaveURL(/\/forums\/moderation$/);
    await expect(page.getByRole("link", { name: "Open reports (1)", exact: true })).toHaveAttribute("aria-current", "page");
    const entry = page.locator(".o-forum-queue > li", { hasText: title });
    await expect(entry).toContainText("Offensive content");
    await expect(entry).toContainText("Insults other captains.");
    await page.screenshot({ path: ".local/forum-moderation-queue.png", fullPage: true });
    await entry.getByRole("button", { name: "Ban author", exact: true }).click();
    await confirm(page, "Ban", /is banned from posting until/, "Repeated insults", "1 day");

    await loginTestAccount(third, author);
    await third.goto("/forums/threads/" + threadId);
    await expect(third.getByText(/You are banned from posting in the forums until .*Reason: Repeated insults/)).toBeVisible();
    await expect(third.getByLabel("Your reply", { exact: true })).toHaveCount(0);
    await expect(third.locator("#post-1").getByRole("button", { name: "Delete", exact: true })).toBeVisible();
    await third.goto("/notifications");
    await expect(third.locator(".o-notification-list")).toContainText("You are banned from posting in the forums until");

    await entry.getByRole("button", { name: "Remove post", exact: true }).click();
    await confirm(page, "Remove post", "Post removed.", "Upheld report");
    await page.reload();
    await expect(page.getByText("No open reports. The queue is clear.", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Resolved", exact: true }).click();
    await expect(page.locator(".o-forum-queue > li", { hasText: title })).toContainText("Resolved by " + admin.name);
    await third.goto("/notifications");
    await expect(third.locator(".o-notification-list")).toContainText("A moderator removed your post in “" + title + "”");

    await page.getByRole("link", { name: "Bans and moderators", exact: true }).click();
    const ban = page.getByRole("region", { name: "Active bans", exact: true }).locator("li", { hasText: author.name });
    await expect(ban).toContainText("Repeated insults");
    await ban.getByRole("button", { name: "Lift ban", exact: true }).click();
    await confirm(page, "Lift ban", author.name + " can post again.", "Served the time");
    await page.getByLabel("Appoint a moderator", { exact: true }).fill("#" + helper.playerNumber);
    await page.getByRole("button", { name: "Appoint", exact: true }).click();
    await confirm(page, "Appoint", helper.name + " is now a forum moderator.", "Trusted captain");
    await page.getByRole("link", { name: "Log", exact: true }).click();
    await expect(page.locator(".o-forum-results")).toContainText("Appointed moderator by " + admin.name);
    await expect(page.locator(".o-forum-results")).toContainText("Banned captain by " + admin.name);
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "moderation at " + width + "px").toBe(true);
    }
    await page.setViewportSize({ width: 1280, height: 900 });

    await third.goto("/forums/threads/" + threadId);
    await expect(third.getByLabel("Your reply", { exact: true })).toBeVisible();
    resetForumCooldown([author.id]);
    await third.getByLabel("Your reply", { exact: true }).fill("Sorry, everyone.");
    await third.getByRole("button", { name: "Post reply", exact: true }).click();
    await expect(third.locator("#post-2 .o-forum-post-main > .o-forum-body")).toHaveText("Sorry, everyone.");
    await third.close();

    const helperPage = await (await browser.newContext({ baseURL })).newPage();
    await loginTestAccount(helperPage, helper);
    await helperPage.goto("/forums");
    await helperPage.getByRole("link", { name: "Moderation (0)", exact: true }).click();
    await expect(helperPage.getByRole("link", { name: "Bans and moderators", exact: true })).toBeVisible();
    await helperPage.getByRole("link", { name: "Bans and moderators", exact: true }).click();
    await expect(helperPage.getByLabel("Appoint a moderator", { exact: true })).toHaveCount(0);
    await helperPage.context().close();

    expect((await reporter.api.rpc("set_mail_ignored", { target_player_number: author.playerNumber, ignored: true })).error).toBeNull();
    await second.goto("/forums/threads/" + threadId);
    const folded = second.locator("#post-2");
    await expect(folded).toContainText("whom you ignore");
    await expect(folded).not.toContainText("Sorry, everyone.");
    await folded.getByRole("button", { name: "Show post", exact: true }).click();
    await expect(second.locator("#post-2 .o-forum-post-main > .o-forum-body")).toHaveText("Sorry, everyone.");
    await second.goto("/forums/moderation");
    await expect(second.getByText("This board, thread or post is not available.", { exact: false })).toBeVisible();
  } finally { await reporting.close(); await authoring.close(); cleanupForumThreads([author.id, reporter.id, admin.id, helper.id]); await cleanupTestAccounts([admin, author, reporter, helper]); }
});
