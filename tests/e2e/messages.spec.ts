import { test, expect, type Page } from "@playwright/test";
import { createTestAccount, cleanupTestAccounts, loginTestAccount, testSql } from "../support/accounts";

type Account = Awaited<ReturnType<typeof createTestAccount>>;
async function deliver(sender: Account, recipients: Account[], subject: string, body: string) {
  const result = await sender.api.rpc("send_mail", { target_numbers: recipients.map(person => person.playerNumber), mail_subject: subject, mail_body: body, request_id: crypto.randomUUID() });
  expect(result.error).toBeNull();
  return result.data!.mail_id;
}
async function addRecipient(page: Page, account: Account) {
  await page.getByLabel("Find player by name or ID").fill(String(account.playerNumber));
  await page.getByRole("button", { name: `Add ${account.name} [${account.playerNumber}]`, exact: true }).click();
}

test("profile compose delivers private bulk mail live, with replies and saved copies", async ({ page, browser, baseURL }) => {
  const sender = await createTestAccount("mail-sender"), recipient = await createTestAccount("mail-recipient"), second = await createTestAccount("mail-second"), outsider = await createTestAccount("mail-outsider");
  const context = await browser.newContext({ baseURL }), receiving = await context.newPage();
  try {
    await loginTestAccount(receiving, recipient);
    await receiving.goto("/messages");
    await expect(receiving.getByText("No mail in this folder.", { exact: false })).toBeVisible();
    await loginTestAccount(page, sender);
    await page.goto("/players/" + sender.playerNumber);
    await expect(page.getByRole("link", { name: "Send message", exact: true })).toHaveCount(0);
    await page.goto("/players/" + recipient.playerNumber);
    await page.getByRole("link", { name: "Send message", exact: true }).click();
    await expect(page).toHaveURL(new RegExp("/messages/compose\\?to=" + recipient.playerNumber + "$"));
    await expect(page.getByRole("list", { name: "Selected recipients" })).toContainText(recipient.name);
    await addRecipient(page, second);
    await page.getByLabel("Subject", { exact: true }).fill("Sailing together");
    const body = "Hello captain!\n<script>window.messageInjected = true</script>";
    await page.getByLabel("Message", { exact: true }).fill(body);
    await page.screenshot({ path: ".local/mail-compose-desktop.png", fullPage: true });
    const compose = page.getByRole("form", { name: "Compose mail", exact: true });
    await compose.evaluate(form => form.addEventListener("submit", () => form.setAttribute("data-submitted", "true")));
    await page.getByLabel("Find player by name or ID").fill("No matching recipient");
    await page.getByLabel("Find player by name or ID").press("Enter");
    await expect(compose).not.toHaveAttribute("data-submitted", "true");
    await page.getByLabel("Find player by name or ID").fill("");
    await page.getByRole("button", { name: "Send mail", exact: true }).click();
    await expect(page.getByText("Mail sent to 2 recipients.", { exact: true })).toBeVisible();
    await expect(page.locator(".o-mail-reader .o-message-body")).toHaveText(body);
    const originalId = new URL(page.url()).pathname.split("/").at(-1)!;
    await expect(receiving.getByRole("link", { name: "Messages, 1 unread", exact: true })).toBeVisible({ timeout: 20000 });
    await expect(receiving.locator(".o-mail-subject")).toHaveText("Sailing together");
    expect((await outsider.api.rpc("get_mail", { mail_id: originalId })).error?.message).toBe("MAIL_NOT_FOUND");
    expect((await second.api.rpc("get_mail", { mail_id: originalId })).data?.recipients).toEqual([]);
    await receiving.locator(".o-mail-subject").click();
    await expect(receiving.locator(".o-mail-reader .o-message-body")).toHaveText(body);
    expect(await receiving.evaluate(() => "messageInjected" in window)).toBe(false);
    await expect(receiving.getByRole("link", { name: "Messages, 0 unread", exact: true })).toBeVisible();
    await expect(receiving.locator(".o-mail-reader")).not.toContainText(second.name);
    await receiving.getByRole("button", { name: "Save", exact: true }).click();
    await expect(receiving.getByRole("link", { name: "Saved (1)", exact: true })).toBeVisible();
    await receiving.getByRole("button", { name: "Reply", exact: true }).click();
    await receiving.getByLabel("Message", { exact: true }).fill("Welcome aboard!");
    await receiving.getByRole("button", { name: "Send mail", exact: true }).click();
    await expect(receiving.getByText("Mail sent to 1 recipient.", { exact: true })).toBeVisible();
    const replyId = new URL(receiving.url()).pathname.split("/").at(-1)!;
    expect((await second.api.rpc("get_mail", { mail_id: replyId, include_history: true })).error?.message).toBe("MAIL_NOT_FOUND");
    await receiving.getByRole("link", { name: "History", exact: true }).click();
    await expect(receiving.getByRole("region", { name: "Mail history" })).toContainText(body);
    await page.goto("/messages");
    await expect(page.locator(".o-mail-subject")).toHaveText("Re: Sailing together");
    await page.locator(".o-mail-subject").click();
    await expect(page.locator(".o-mail-reader .o-message-body")).toHaveText("Welcome aboard!");
    await page.reload();
    await expect(page.locator(".o-mail-reader .o-message-body")).toHaveText("Welcome aboard!");
    for (const width of [1280, 375, 320]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: ".local/mail-reader.png", fullPage: true });
    await receiving.goto("/messages?folder=saved");
    await receiving.screenshot({ path: ".local/mail-inbox.png", fullPage: true });
    for (const width of [375, 320]) {
      await receiving.setViewportSize({ width, height: 900 });
      expect(await receiving.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await receiving.screenshot({ path: ".local/mail-mobile.png", fullPage: true });
    await receiving.getByRole("checkbox", { name: "Select Sailing together", exact: true }).check();
    await receiving.getByRole("button", { name: "Delete selected", exact: true }).click();
    await expect(receiving.getByText("No mail in this folder.", { exact: false })).toBeVisible();
    expect((await second.api.rpc("get_mail", { mail_id: originalId })).data?.subject).toBe("Sailing together");
    const longSubject = "x".repeat(120), longId = await deliver(sender, [recipient], longSubject, "Long subject history");
    const longReply = await recipient.api.rpc("send_mail", { target_numbers: [sender.playerNumber], mail_subject: "Re: Long subject", mail_body: "A reply", request_id: crypto.randomUUID(), reply_to_id: longId });
    expect(longReply.error).toBeNull();
    await page.goto("/messages/mail/" + longReply.data!.mail_id + "?history=1");
    await expect(page.getByRole("region", { name: "Mail history" })).toContainText(longSubject);
    await page.setViewportSize({ width: 320, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await context.close(); await page.close(); await cleanupTestAccounts([sender,recipient,second,outsider]); }
});

test("lost bulk send responses survive reload and concurrent retries never duplicate delivery", async ({ page }) => {
  const sender = await createTestAccount("mail-retry"), recipient = await createTestAccount("mail-retry-other"), second = await createTestAccount("mail-retry-second");
  try {
    await loginTestAccount(page, sender);
    await page.goto("/messages/compose?to=" + recipient.playerNumber);
    await addRecipient(page, second);
    let intercepted = false;
    await page.route("**/messages/compose?*", async route => {
      if (route.request().method() !== "POST" || intercepted) { await route.continue(); return; }
      intercepted = true;
      await route.fetch(); await route.abort("failed");
    });
    await page.getByLabel("Subject", { exact: true }).fill("Retry subject");
    await page.getByLabel("Message", { exact: true }).fill("One delivery each");
    await page.getByRole("button", { name: "Send mail", exact: true }).click();
    await expect(page.getByRole("button", { name: "Retry mail", exact: true })).toBeVisible();
    await page.unroute("**/messages/compose?*");
    await page.reload();
    await expect(page.getByRole("button", { name: "Retry mail", exact: true })).toBeVisible();
    await expect(page.getByLabel("Subject", { exact: true })).toHaveValue("Retry subject");
    await expect(page.getByRole("list", { name: "Selected recipients" })).toContainText(second.name);
    await page.getByRole("button", { name: "Retry mail", exact: true }).click();
    await expect(page.getByText("Mail sent to 2 recipients.", { exact: true })).toBeVisible();
    expect((await recipient.api.rpc("get_mail_summary")).data?.inbox).toBe(1);
    expect((await second.api.rpc("get_mail_summary")).data?.inbox).toBe(1);
    const args = { target_numbers: [recipient.playerNumber, second.playerNumber], mail_subject: "Concurrent", mail_body: "One envelope", request_id: crypto.randomUUID() };
    const results = await Promise.all([sender.api.rpc("send_mail", args), sender.api.rpc("send_mail", args), recipient.api.rpc("send_mail", { target_numbers: [sender.playerNumber], mail_subject: "Other direction", mail_body: "Concurrent reply", request_id: crypto.randomUUID() })]);
    for (const result of results) expect(result.error).toBeNull();
    expect(results[0].data).toEqual(results[1].data);
    expect((await recipient.api.rpc("get_mail_summary")).data?.inbox).toBe(2);
    expect((await second.api.rpc("get_mail_summary")).data?.inbox).toBe(2);
  } finally { await page.close(); await cleanupTestAccounts([sender,recipient,second]); }
});

test("mail search, numbered pages and bulk actions work in Hospital and during travel", async ({ page, browser, baseURL }) => {
  const sender = await createTestAccount("mail-pages"), recipient = await createTestAccount("mail-pages-other");
  const context = await browser.newContext({ baseURL }), traveling = await context.newPage();
  try {
    await deliver(sender, [recipient], "First mail", "First message");
    testSql(`with mails as (
      insert into private.mail_messages(sender_id,sender_name,sender_player_number,recipients,recipient_numbers,request_id,subject,body,sent_at)
      select '${sender.id}','${sender.name}',${sender.playerNumber},'[]',array[${recipient.playerNumber}],gen_random_uuid(),'Archive '||n,'Older body',clock_timestamp()-interval '1 hour' from generate_series(1,21) n returning id
    ) insert into private.mail_boxes(mail_id,character_id,direction) select id,'${recipient.id}','inbox' from mails;
    update public.characters set crew_health=0 where id='${recipient.id}';`);
    await loginTestAccount(page, recipient, true);
    await page.getByRole("link", { name: "Messages, 22 unread", exact: true }).click();
    await expect(page.locator(".o-mail-subject")).toHaveCount(10);
    expect(await page.locator(".o-mail-letters").evaluate(element => element.scrollHeight <= element.clientHeight)).toBe(true);
    const heights = await page.locator(".o-mail-letter").evaluateAll(rows => rows.map(row => row.getBoundingClientRect().height));
    expect(heights.every(height => height <= 46)).toBe(true);
    await page.screenshot({ path: ".local/mail-paged-inbox.png", fullPage: true });
    await page.getByRole("link", { name: "Page 2", exact: true }).first().click();
    await expect(page.locator(".o-mail-subject")).toHaveCount(10);
    await expect(page.locator(".o-mail-list-foot")).toContainText("11-20 of 22");
    await page.getByRole("link", { name: "Page 3", exact: true }).click();
    await expect(page.locator(".o-mail-subject")).toHaveCount(2);
    await expect(page.locator(".o-mail-list-foot")).toContainText("21-22 of 22");
    await page.getByLabel("Search mail", { exact: true }).fill("First mail");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.locator(".o-mail-subject")).toHaveText(["First mail"]);
    await page.getByRole("button", { name: "Check all", exact: true }).click();
    await page.getByRole("button", { name: "Save selected", exact: true }).click();
    await page.getByRole("link", { name: "Saved (1)", exact: true }).click();
    await page.locator(".o-mail-subject").click();
    await page.getByRole("button", { name: "Reply", exact: true }).click();
    await page.getByLabel("Message", { exact: true }).fill("Reply from Hospital");
    await page.getByRole("button", { name: "Send mail", exact: true }).click();
    await expect(page.getByText("Mail sent to 1 recipient.", { exact: true })).toBeVisible();
    await loginTestAccount(traveling, sender);
    const state = await sender.api.rpc("get_game_state");
    expect((await sender.api.rpc("depart_harbor", { expected_version: state.data!.sea.version, request_id: crypto.randomUUID() })).error).toBeNull();
    await traveling.goto("/messages/compose?to=" + recipient.playerNumber);
    await traveling.getByLabel("Message", { exact: true }).fill("Mail at sea");
    await traveling.getByRole("button", { name: "Send mail", exact: true }).click();
    await expect(traveling.getByText("Mail sent to 1 recipient.", { exact: true })).toBeVisible();
    await page.goto("/messages");
    await page.getByRole("button", { name: "Check all", exact: true }).click();
    await page.getByRole("button", { name: "Mark read", exact: true }).click();
    await expect(page.locator('.o-mail-letter[data-unread="true"]')).toHaveCount(0);
  } finally { await context.close(); await page.close(); await cleanupTestAccounts([sender,recipient]); }
});

test("hidden mail stays unread until visible", async ({ page }) => {
  const sender = await createTestAccount("mail-hidden"), recipient = await createTestAccount("mail-hidden-other");
  try {
    const id = await deliver(sender, [recipient], "Hidden mail", "Read when you return");
    await loginTestAccount(page, recipient);
    await page.addInitScript(() => Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" }));
    await page.goto("/messages/mail/" + id);
    await expect(page.locator(".o-mail-reader .o-message-body")).toHaveText("Read when you return");
    await page.getByRole("button", { name: "Reply", exact: true }).click();
    await page.getByLabel("Message", { exact: true }).fill("A draft");
    expect((await recipient.api.rpc("get_message_summary")).data?.unread_count).toBe(1);
    await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" }); document.dispatchEvent(new Event("visibilitychange")); });
    await expect(page.getByRole("link", { name: "Messages, 0 unread", exact: true })).toBeVisible();
    expect((await recipient.api.rpc("get_message_summary")).data?.unread_count).toBe(0);
    await expect(page.getByLabel("Message", { exact: true })).toHaveValue("A draft");
  } finally { await page.close(); await cleanupTestAccounts([sender,recipient]); }
});

test("ignore sender blocks new mail and removing them restores delivery", async ({ page }) => {
  const sender = await createTestAccount("mail-ignore"), recipient = await createTestAccount("mail-ignore-other");
  try {
    const id = await deliver(sender, [recipient], "A mail", "Hello");
    await loginTestAccount(page, recipient);
    await page.goto("/messages/mail/" + id);
    await page.getByRole("button", { name: "Ignore sender", exact: true }).click();
    await expect(page.getByText(sender.name + " was added to your ignore list.", { exact: true })).toBeVisible();
    const args = { target_numbers: [recipient.playerNumber], mail_subject: "Blocked", mail_body: "Later", request_id: crypto.randomUUID() };
    expect((await sender.api.rpc("send_mail", args)).error?.message).toBe("RECIPIENT_UNAVAILABLE");
    await page.getByRole("link", { name: "Ignore list (1)", exact: true }).click();
    await page.getByRole("button", { name: "Remove " + sender.name, exact: true }).click();
    await expect(page.getByText("Your ignore list is empty.", { exact: true })).toBeVisible();
    expect((await sender.api.rpc("send_mail", args)).error).toBeNull();
    await addRecipient(page, sender);
    await page.getByRole("button", { name: "Ignore player", exact: true }).click();
    await expect(page.getByRole("list", { name: "Ignored players" })).toContainText(sender.name);
    await page.setViewportSize({ width: 320, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await page.close(); await cleanupTestAccounts([sender,recipient]); }
});

test("legacy profile links recover old pending sends without duplicate mail", async ({ page }) => {
  const sender = await createTestAccount("mail-legacy"), recipient = await createTestAccount("mail-legacy-other"), other = await createTestAccount("mail-legacy-pending");
  try {
    const id = crypto.randomUUID();
    testSql(`select set_config('request.jwt.claims','{"sub":"${sender.userId}","role":"authenticated"}',false);
      with thread as (
        insert into private.message_threads(participant_a,participant_b)
        values(least('${sender.id}'::uuid,'${recipient.id}'::uuid),greatest('${sender.id}'::uuid,'${recipient.id}'::uuid)) returning id
      ) insert into private.player_messages(thread_id,sender_id,recipient_id,request_id,body)
        select id,'${sender.id}','${recipient.id}','${id}','Old pending message' from thread;
      select private.import_legacy_mail();`);
    await loginTestAccount(page, sender);
    await page.evaluate(({ characterId, number, requestId }) => sessionStorage.setItem("pending-message:" + characterId + ":" + number, JSON.stringify({ id: requestId, body: "Old pending message" })), { characterId: sender.id, number: recipient.playerNumber, requestId: id });
    await page.goto("/messages/" + recipient.playerNumber);
    await expect(page.getByRole("button", { name: "Retry mail", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Retry mail", exact: true }).click();
    await expect(page.getByText("Mail sent to 1 recipient.", { exact: true })).toBeVisible();
    expect((await recipient.api.rpc("get_mail_summary")).data?.inbox).toBe(1);
    await expect(page.locator(".o-mail-reader .o-message-body")).toHaveText("Old pending message");
    const otherId = crypto.randomUUID();
    await page.evaluate(({ characterId, recipient, other, id, otherId }) => {
      sessionStorage.setItem("pending-mail:" + characterId, JSON.stringify({ id, body: "Old pending message", subject: "", recipients: [recipient], replyTo: null }));
      sessionStorage.setItem("pending-message:" + characterId + ":" + other, JSON.stringify({ id: otherId, body: "A separate pending message" }));
    }, { characterId: sender.id, recipient: { display_name: recipient.name, player_number: recipient.playerNumber }, other: other.playerNumber, id, otherId });
    await page.goto("/messages/" + other.playerNumber);
    await expect(page.getByRole("list", { name: "Selected recipients" })).toContainText(recipient.name);
    await page.getByRole("button", { name: "Retry mail", exact: true }).click();
    await expect(page.getByText("Mail sent to 1 recipient.", { exact: true })).toBeVisible();
    const preserved = await page.evaluate(key => sessionStorage.getItem(key), "pending-message:" + sender.id + ":" + other.playerNumber);
    expect(JSON.parse(preserved!).id).toBe(otherId);
    expect((await recipient.api.rpc("get_mail_summary")).data?.inbox).toBe(1);
    expect((await other.api.rpc("get_mail_summary")).data?.inbox).toBe(0);
  } finally { await page.close(); await cleanupTestAccounts([sender,recipient,other]); }
});


test("mail desk preserves folder context and unread state while long letters reflow", async ({ page }) => {
  const sender = await createTestAccount("mail-long"), recipient = await createTestAccount("mail-long-reader");
  try {
    const longSubject = "Captain's journal " + "x".repeat(100);
    const body = ("Dear captain,\n\n" + "A long letter with room for every voyage.\n\n".repeat(90) + "https://example.test/" + "x".repeat(1600)).slice(0, 4988) + "\nEnd of mail";
    expect(body.length).toBe(5000);
    const longId = await deliver(sender, [recipient], longSubject, body);
    await deliver(sender, [recipient], "A short letter", "Meet me in the harbor at dawn.");
    await loginTestAccount(page, recipient);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/messages");
    await expect(page.getByText("Select a mail to read it here.", { exact: true })).toBeVisible();
    expect((await recipient.api.rpc("get_message_summary")).data?.unread_count).toBe(2);
    await page.locator(".o-mail-subject").filter({ hasText: "A short letter" }).click();
    await expect(page.locator('.o-mail-letter[data-opened="true"]')).toContainText("A short letter");
    await expect(page.locator(".o-mail-reader .o-message-body")).toHaveText("Meet me in the harbor at dawn.");
    const list = await page.locator(".o-mail-list").boundingBox(), paper = await page.locator(".o-mail-reader .o-mail-paper").boundingBox();
    expect(list!.x + list!.width).toBeLessThan(paper!.x);
    await page.screenshot({ path: ".local/mail-desk-desktop.png", fullPage: true });
    await page.locator(".o-mail-subject").filter({ hasText: longSubject }).click();
    await expect(page).toHaveURL(new RegExp("/messages/mail/" + longId));
    await expect(page.locator(".o-mail-reader .o-message-body")).toHaveText(body);
    for (const width of [1440, 768, 375, 320]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await page.locator(".o-mail-reader .o-message-body").evaluate(element => {
        const rect = element.getBoundingClientRect(), paper = element.closest(".o-mail-paper")!.getBoundingClientRect();
        return element.scrollWidth <= element.clientWidth + 1 && element.scrollHeight <= element.clientHeight + 1 && paper.bottom >= rect.bottom + 100;
      })).toBe(true);
    }
    await page.locator(".o-mail-reader").screenshot({ path: ".local/mail-desk-long-mobile.png" });
    await page.getByRole("button", { name: "Reply", exact: true }).click();
    await page.getByLabel("Message", { exact: true }).fill("Keep this draft while reviewing history.");
    await page.getByRole("link", { name: "History", exact: true }).click();
    await expect(page.getByLabel("Message", { exact: true })).toHaveValue("Keep this draft while reviewing history.");
    await page.getByRole("button", { name: "Mark unread", exact: true }).click();
    await expect(page).toHaveURL(/\/messages$/);
    await expect(page.locator('.o-mail-letter[data-unread="true"]')).toContainText([longSubject]);
    expect((await recipient.api.rpc("get_mail", { mail_id: longId })).data?.read_at).toBeNull();
    await page.getByLabel("Search mail", { exact: true }).fill("Captain's journal");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.locator(".o-mail-subject")).toHaveText([longSubject]);
    await page.locator(".o-mail-subject").click();
    await expect(page.getByLabel("Search mail", { exact: true })).toHaveValue("Captain's journal");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page).toHaveURL(/q=Captain/);
    await expect(page.getByText("No mail matches your search.", { exact: true })).toBeVisible();
    expect((await recipient.api.rpc("get_mail", { mail_id: longId })).error?.message).toBe("MAIL_NOT_FOUND");
  } finally { await page.close(); await cleanupTestAccounts([sender,recipient]); }
});


test("parchment compose grows for long drafts and sends from a narrow screen", async ({ page }) => {
  const sender = await createTestAccount("compose-paper"), recipient = await createTestAccount("compose-paper-reader");
  try {
    await loginTestAccount(page, sender);
    await page.goto("/messages/compose?to=" + recipient.playerNumber);
    const editor = page.getByLabel("Message", { exact: true });
    await expect(editor).toBeVisible();
    const initialHeight = (await editor.boundingBox())!.height;
    const body = ("A captain's letter can tell the story of many voyages.\n\n").repeat(120).slice(0, 4999) + "!";
    await page.getByLabel("Subject", { exact: true }).fill("A long voyage");
    await editor.fill(body);
    await expect(page.getByText("5000 / 5000 characters", { exact: true })).toBeVisible();
    expect((await editor.boundingBox())!.height).toBeGreaterThan(initialHeight);
    for (const width of [1280, 768, 375, 320]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await editor.evaluate(element => element.scrollHeight <= element.clientHeight + 1)).toBe(true);
      await expect(editor).toHaveValue(body);
    }
    await editor.fill("A letter from the harbor.\n\nUntil our next voyage!");
    await page.locator(".o-mail-compose").screenshot({ path: ".local/mail-compose-mobile.png" });
    await editor.fill(body);
    await page.getByRole("button", { name: "Send mail", exact: true }).click();
    await expect(page.getByText("Mail sent to 1 recipient.", { exact: true })).toBeVisible();
    const id = new URL(page.url()).pathname.split("/").at(-1)!;
    expect((await recipient.api.rpc("get_mail", { mail_id: id })).data?.body).toBe(body);
  } finally { await page.close(); await cleanupTestAccounts([sender,recipient]); }
});
