import { test, expect, type Page } from "@playwright/test";
import sharp from "sharp";
import { createTestAccount, cleanupTestAccounts, loginTestAccount, testSql } from "../support/accounts";
import { cleanupForumThreads, removeForumImages, resetForumCooldown } from "../support/forum";

// Toggling the preview proves the settings form is hydrated before its controlled inputs change.
async function settingsReady(page: Page) {
  await page.goto("/forums/settings");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.getByRole("button", { name: "Write", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Write", exact: true }).click();
}

async function confirm(page: Page, button: string, notice: string, reason: string) {
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: /^Reason/ }).fill(reason);
  await dialog.getByRole("button", { name: button, exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: notice })).toBeVisible();
}

test("captains run polls, share images and signatures, and find popular threads", async ({ page, browser, baseURL }) => {
  const author = await createTestAccount("forum-poller"), voter = await createTestAccount("forum-voter"), rookie = await createTestAccount("forum-rookie"),
    admin = await createTestAccount("forum-curator");
  // Voting, signatures and uploads need captains older than a day; the rookie stays new.
  testSql("insert into private.admin_members(user_id) values('" + admin.userId + "'); update public.characters set created_at=clock_timestamp()-interval '3 days' where id in('" +
    author.id + "','" + voter.id + "','" + admin.id + "');");
  const contexts = await Promise.all([1, 2, 3].map(() => browser.newContext({ baseURL })));
  const [second, third, curator] = await Promise.all(contexts.map(context => context.newPage()));
  const title = "Next flagship " + author.name;
  try {
    await loginTestAccount(page, author);
    await page.goto("/forums/boards/general_discussion/new");
    await page.getByLabel("Title", { exact: true }).fill(title);
    await page.getByLabel("Opening post", { exact: true }).fill("Which ship should the harbor build next? Here is the yard:");
    const picture = await sharp({ create: { width: 2400, height: 1200, channels: 3, background: "#1b4965" } }).png().toBuffer();
    await expect(page.locator("input[data-forum-image-input]")).toBeEnabled();
    await page.locator("input[data-forum-image-input]").setInputFiles({ name: "yard.png", mimeType: "image/png", buffer: picture });
    await expect(page.getByLabel("Opening post", { exact: true })).toHaveValue(/\[img\][0-9a-f-]{36}\[\/img\]/);
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await expect(page.locator(".o-forum-preview img")).toBeVisible();
    await expect.poll(() => page.locator(".o-forum-preview img").evaluate(image => (image as HTMLImageElement).naturalWidth)).toBe(1600);
    await page.getByRole("button", { name: "Write", exact: true }).click();
    await page.getByRole("button", { name: "Add a poll", exact: true }).click();
    await page.getByLabel("Question", { exact: true }).fill("Which ship?");
    await page.getByLabel("Option 1", { exact: true }).fill("Sloop");
    await page.getByLabel("Option 2", { exact: true }).fill("Frigate");
    await page.getByRole("button", { name: "Add option", exact: true }).click();
    await page.getByLabel("Option 3", { exact: true }).fill("Galleon");
    await page.getByLabel("Closes").selectOption({ label: "after 3 days" });
    await page.getByRole("button", { name: "Create thread", exact: true }).click();
    await expect(page).toHaveURL(/\/forums\/threads\/\d+$/);
    const threadId = new URL(page.url()).pathname.split("/").pop()!;
    const poll = page.getByRole("region", { name: "Which ship?", exact: true });
    await expect(poll).toContainText("0 voters");
    await expect(poll).toContainText("Vote to see the results.");
    const image = page.locator("#post-1 .o-forum-image img");
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBe(1600);
    const imageUrl = (await image.getAttribute("src"))!;
    expect((await page.request.post("/api/forum-images", { headers: { origin: "https://evil.example" }, multipart: { request_id: crypto.randomUUID(),
      file: { name: "x.png", mimeType: "image/png", buffer: picture } } })).status()).toBe(403);

    await loginTestAccount(second, voter);
    await second.goto("/forums/threads/" + threadId);
    const ballot = second.getByRole("region", { name: "Which ship?", exact: true });
    await ballot.getByLabel("Galleon", { exact: true }).check();
    await ballot.getByRole("button", { name: "Vote", exact: true }).click();
    await expect(ballot).toContainText("1 voter");
    await expect(ballot.locator("li", { hasText: "Galleon" })).toContainText("1 (100%)");
    await ballot.getByRole("button", { name: "Change vote", exact: true }).click();
    await ballot.getByLabel("Frigate", { exact: true }).check();
    await ballot.getByRole("button", { name: "Save vote", exact: true }).click();
    await expect(ballot.locator("li", { hasText: "Frigate" })).toContainText("1 (100%)");
    expect((await second.request.get(imageUrl)).status()).toBe(200);

    await settingsReady(second);
    await second.getByLabel("Signature", { exact: true }).fill("[b]Captain of the Sea Wolf[/b]");
    await second.getByRole("button", { name: "Save settings", exact: true }).click();
    await expect(second.getByRole("status").filter({ hasText: "Settings saved." })).toBeVisible();
    await second.goto("/forums/threads/" + threadId);
    await second.getByLabel("Your reply", { exact: true }).fill("Frigates win wars.");
    await second.getByRole("button", { name: "Post reply", exact: true }).click();
    await expect(second.locator("#post-2 .o-forum-signature")).toContainText("Captain of the Sea Wolf");
    resetForumCooldown([voter.id]);
    await second.getByLabel("Your reply", { exact: true }).fill("And they are fast.");
    await second.getByRole("button", { name: "Post reply", exact: true }).click();
    await expect(second.locator("#post-3 .o-forum-post-main > .o-forum-body")).toHaveText("And they are fast.");
    await expect(second.locator("#post-3 .o-forum-signature")).toHaveCount(0);

    // Reply notices are delivered once the reply has been saved, not inside it.
    await expect(page.getByRole("link", { name: /^Notifications, \d+ unread$/ })).toBeVisible({ timeout: 20000 });
    await page.goto("/notifications");
    await expect(page.locator(".o-notification-list")).toContainText(voter.name + " replied in “" + title + "”");

    await loginTestAccount(third, rookie);
    await third.goto("/forums/threads/" + threadId);
    const rookieView = third.getByRole("region", { name: "Which ship?", exact: true });
    await expect(rookieView.getByRole("button", { name: "Vote", exact: true })).toHaveCount(0);
    await expect(rookieView.locator("li", { hasText: "Frigate" })).toContainText("1 (100%)");
    await expect(third.locator("#post-2 .o-forum-signature")).toContainText("Captain of the Sea Wolf");
    await expect(third.getByRole("button", { name: "Add image", exact: true })).toHaveCount(0);
    await settingsReady(third);
    await expect(third.getByText(/New captains can add a signature after/)).toBeVisible();
    await third.getByLabel("Show other captains' signatures", { exact: true }).uncheck();
    await third.getByRole("button", { name: "Save settings", exact: true }).click();
    await expect(third.getByRole("status").filter({ hasText: "Settings saved." })).toBeVisible();
    await third.goto("/forums/threads/" + threadId);
    await expect(third.locator("#post-2 .o-forum-post-main > .o-forum-body")).toHaveText("Frigates win wars.");
    await expect(third.locator(".o-forum-signature")).toHaveCount(0);

    testSql("select private.refresh_forum_popular();");
    await third.goto("/forums");
    await expect(third.getByRole("region", { name: "Popular threads", exact: true })).toContainText(title);
    for (const width of [390, 320]) {
      await second.setViewportSize({ width, height: 900 });
      await second.goto("/forums/threads/" + threadId);
      await expect(second.locator("#post-1 .o-forum-image img")).toBeVisible();
      expect(await second.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "thread with poll at " + width + "px").toBe(true);
    }
    await second.screenshot({ path: ".local/forum-poll-mobile.png", fullPage: true });

    await page.goto("/forums/threads/" + threadId);
    await poll.getByRole("button", { name: "Close poll", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Close poll", exact: true }).click();
    await expect(poll).toContainText("Closed by the thread's author");
    await expect(poll.locator("li", { hasText: "Frigate" })).toContainText("1 (100%)");
    await page.screenshot({ path: ".local/forum-poll-desktop.png", fullPage: true });

    await loginTestAccount(curator, admin);
    await curator.goto("/forums/threads/" + threadId);
    await curator.getByRole("list", { name: "Images in post #1", exact: true }).getByRole("button", { name: "Hide image", exact: true }).click();
    await confirm(curator, "Hide image", "Image hidden from players.", "Graphic content");
    await expect(curator.locator("#post-1 .o-forum-image small")).toHaveText("Hidden from players. Only moderators can see it.");
    await second.reload();
    await expect(second.locator("#post-1")).toContainText("Image removed by a moderator");
    expect((await second.request.get(imageUrl)).status()).toBe(404);
    expect((await curator.request.get(imageUrl)).status()).toBe(200);
    await curator.getByRole("list", { name: "Images in post #1", exact: true }).getByRole("button", { name: "Delete file", exact: true }).click();
    await confirm(curator, "Delete file", "Image file deleted.", "Illegal content");
    await expect(curator.locator("#post-1")).toContainText("Image deleted by an administrator");
    expect(testSql("select count(*) from storage.objects o join private.forum_images i on i.storage_path=o.name where o.bucket_id='forum-images' and i.owner_id='" + author.id + "';").trim()).toBe("0");
    await page.goto("/notifications");
    await expect(page.locator(".o-notification-list")).toContainText("A moderator removed your image in “" + title + "”");
    await curator.getByRole("group", { name: "Moderation", exact: true }).getByRole("button", { name: "Remove poll", exact: true }).click();
    await confirm(curator, "Remove poll", "Poll removed.", "Rude options");
    await second.reload();
    await expect(second.getByRole("region", { name: "Poll", exact: true })).toContainText("A moderator removed this poll.");

    // The hourly sweep asks the Storage API to delete files of uploads nobody used.
    await expect(second.locator("input[data-forum-image-input]")).toBeEnabled();
    await second.locator("input[data-forum-image-input]").setInputFiles({ name: "unused.png", mimeType: "image/png", buffer: picture });
    await expect(second.getByLabel("Your reply", { exact: true })).toHaveValue(/\[img\][0-9a-f-]{36}\[\/img\]/);
    const unused = testSql("select storage_path from private.forum_images where owner_id='" + voter.id + "' and attached_at is null;").trim();
    expect(unused).toMatch(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/);
    testSql("update private.forum_images set created_at=clock_timestamp()-interval '2 days' where storage_path='" + unused + "';");
    expect(Number(testSql("select private.sweep_forum_images();").trim())).toBeGreaterThanOrEqual(1);
    await expect.poll(() => testSql("select count(*) from storage.objects where bucket_id='forum-images' and name='" + unused + "';").trim(), { timeout: 20000 }).toBe("0");
    testSql("select private.sweep_forum_images();");
    expect(testSql("select discarded_at is not null from private.forum_images where storage_path='" + unused + "';").trim()).toBe("t");
  } finally {
    await Promise.all(contexts.map(context => context.close()));
    await removeForumImages(admin, [author.id, voter.id, rookie.id, admin.id]);
    cleanupForumThreads([author.id, voter.id, rookie.id, admin.id]);
    await cleanupTestAccounts([author, voter, rookie, admin]);
  }
});
