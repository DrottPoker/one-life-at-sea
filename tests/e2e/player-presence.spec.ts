import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { cleanupTestAccounts, createTestAccount, loginTestAccount, testSql } from "../support/accounts";

const presenceFor = async (account: Awaited<ReturnType<typeof createTestAccount>>) => {
  const response = await account.api.rpc("get_character_status", { target_id: account.id });
  expect(response.error).toBeNull();
  return response.data!.presence;
};

test("profile presence and last action refresh for another player without navigation", async ({ page }) => {
  test.setTimeout(150000);
  const accounts: Awaited<ReturnType<typeof createTestAccount>>[] = [];
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    const viewer = await createTestAccount("presence-viewer"); accounts.push(viewer);
    const actor = await createTestAccount("presence-actor"); accounts.push(actor);
    await loginTestAccount(page, viewer);
    await page.goto(`/players/${actor.playerNumber}`);
    const main = page.getByRole("main"), status = main.getByRole("img", { name: /^Player status:/ });
    const lastAction = main.getByLabel("Last action", { exact: true });
    await expect(main.getByRole("heading", { name: actor.name + " [" + actor.playerNumber + "]", exact: true })).toBeVisible();
    const profilePresence = main.locator(".o-profile-presence");
    await expect(main.locator("dt").filter({ hasText: /^Player status$/ })).toHaveCount(0);
    await expect(profilePresence.locator(".o-presence-dot")).toHaveCSS("width", "12px");
    await expect(profilePresence.locator(".o-presence-dot")).toHaveCSS("height", "12px");
    await expect(status).toHaveAttribute("aria-label", "Player status: Offline");
    await expect(profilePresence).toHaveAttribute("data-presence", "offline");
    await expect(lastAction).toHaveText("Not recorded yet");
    const tab = randomUUID();
    expect((await actor.api.rpc("record_player_presence", { tab_id: tab, is_active: true, page_action: true })).error).toBeNull();
    await expect(status).toHaveAttribute("aria-label", "Player status: Online", { timeout: 25000 });
    await expect(profilePresence).toHaveAttribute("data-presence", "online");
    await expect(lastAction).toHaveText("Just now");
    testSql(`update private.character_actions set last_action_at=statement_timestamp()-interval '65 seconds' where character_id='${actor.id}'`);
    await expect(lastAction).toHaveText("1 minute ago", { timeout: 25000 });
    expect((await actor.api.rpc("perform_activity", { activity_id: "shore_fishing", expected_stamina_cost: 1, expected_xp_gain: 10, request_id: randomUUID() })).error).toBeNull();
    await expect(lastAction).toHaveText("Just now", { timeout: 25000 });
    const actionAt = (await presenceFor(actor)).last_action_at;
    expect((await actor.api.rpc("record_player_presence", { tab_id: tab, is_active: false })).error).toBeNull();
    await expect(status).toHaveAttribute("aria-label", "Player status: Idle", { timeout: 25000 });
    await expect(profilePresence).toHaveAttribute("data-presence", "idle");
    expect((await presenceFor(actor)).last_action_at).toBe(actionAt);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: ".local/presence-desktop.png", fullPage: true });
    for (const width of [768, 375, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(status).toBeVisible();
      await expect(lastAction).toBeVisible();
      if (width === 375) await page.screenshot({ path: ".local/presence-mobile.png", fullPage: true });
    }
    await page.route("**/rest/v1/rpc/get_character_status", route => route.abort());
    await expect(status).toHaveAttribute("aria-label", "Player status: Unavailable", { timeout: 25000 });
    await expect(profilePresence).toHaveAttribute("data-presence", "unknown");
    await expect(lastAction).toContainText("last known");
    await page.unroute("**/rest/v1/rpc/get_character_status");
    await main.getByRole("button", { name: "Retry status" }).click();
    await expect(status).toHaveAttribute("aria-label", "Player status: Idle");
    await actor.api.auth.signOut();
    await expect(status).toHaveAttribute("aria-label", "Player status: Offline", { timeout: 25000 });
    await expect(lastAction).not.toHaveText("Not recorded yet");
    expect(errors).toEqual([]);
  } finally { await page.close(); await cleanupTestAccounts(accounts); }
});

test("browser presence idles, resumes and coordinates tabs without changing last action", async ({ page, context }) => {
  const accounts: Awaited<ReturnType<typeof createTestAccount>>[] = [];
  try {
    const actor = await createTestAccount("presence-browser"); accounts.push(actor);
    await page.clock.install();
    await loginTestAccount(page, actor);
    await page.goto(`/players/${actor.playerNumber}`);
    await expect(page.getByRole("main").getByRole("img", { name: "Player status: Online", exact: true })).toBeVisible();
    // Let initial page-action writes finish before advancing the browser clock.
    await page.waitForLoadState("networkidle");
    const actionAt = (await presenceFor(actor)).last_action_at;
    await page.clock.fastForward(299000);
    expect((await presenceFor(actor)).online_until).not.toBeNull();
    await page.clock.fastForward(2000);
    await expect.poll(async () => (await presenceFor(actor)).online_until).toBeNull();
    expect((await presenceFor(actor)).last_action_at).toBe(actionAt);
    await page.mouse.move(200, 200);
    await expect.poll(async () => (await presenceFor(actor)).online_until).not.toBeNull();
    expect((await presenceFor(actor)).last_action_at).toBe(actionAt);
    // Headless tabs retain focus, so drive the browser focus signals explicitly.
    const setFocus = async (focused: boolean, hidden = false) => page.evaluate(({ focused, hidden }) => {
      Object.defineProperty(document, "hasFocus", { configurable: true, value: () => focused });
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => hidden ? "hidden" : "visible" });
      window.dispatchEvent(new Event(focused ? "focus" : "blur"));
      document.dispatchEvent(new Event("visibilitychange"));
    }, { focused, hidden });
    await setFocus(false);
    await page.clock.fastForward(119000);
    expect((await presenceFor(actor)).online_until).not.toBeNull();
    // Duplicate visibility signals must not restart the two-minute deadline.
    await setFocus(false, true);
    await page.clock.fastForward(2000);
    await expect.poll(async () => (await presenceFor(actor)).online_until).toBeNull();
    expect((await presenceFor(actor)).last_action_at).toBe(actionAt);
    await setFocus(true);
    await expect.poll(async () => (await presenceFor(actor)).online_until).not.toBeNull();
    await setFocus(false);
    await page.clock.fastForward(60000);
    await setFocus(true);
    await setFocus(false);
    await page.clock.fastForward(61000);
    expect((await presenceFor(actor)).online_until).not.toBeNull();
    await page.clock.fastForward(60000);
    await expect.poll(async () => (await presenceFor(actor)).online_until).toBeNull();
    expect((await presenceFor(actor)).last_action_at).toBe(actionAt);
    await setFocus(true);
    await page.evaluate(() => {
      Reflect.deleteProperty(document, "hasFocus");
      Reflect.deleteProperty(document, "visibilityState");
    });
    await expect.poll(async () => (await presenceFor(actor)).online_until).not.toBeNull();
    const second = await context.newPage();
    await second.goto(`/players/${actor.playerNumber}`);
    await second.bringToFront();
    await expect(second.getByRole("main").getByRole("img", { name: "Player status: Online", exact: true })).toBeVisible();
    await expect.poll(() => Number(testSql(`select count(*) from private.player_presence where character_id='${actor.id}'`))).toBe(2);
    expect((await presenceFor(actor)).online_until).not.toBeNull();
    await second.waitForLoadState("networkidle");
    const afterSecond = (await presenceFor(actor)).last_action_at;
    await second.close();
    await page.bringToFront();
    await page.mouse.move(250, 250);
    await expect.poll(async () => (await presenceFor(actor)).online_until).not.toBeNull();
    expect((await presenceFor(actor)).last_action_at).toBe(afterSecond);
    await page.getByRole("button", { name: "Log out", exact: true }).first().click();
    await expect(page).toHaveURL(/\/login$/);
    await expect.poll(async () => (await presenceFor(actor)).connected_until).toBeNull();
  } finally { await page.close(); await cleanupTestAccounts(accounts); }
});
