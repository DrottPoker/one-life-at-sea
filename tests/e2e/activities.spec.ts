import { test, expect, type Page } from "@playwright/test";
import { createTestAccount, cleanupTestAccounts, loginTestAccount, testSql } from "../support/accounts";
import { economyJournalKey } from "../../src/lib/economy-journal";

const offer = { activity_id: "shore_fishing", expected_stamina_cost: 1, expected_xp_gain: 10 };
// Captures the XP drop one second into its display for visual review.
async function xpDropShot(page: Page, path: string) {
  const card = page.locator(".o-xp-drop");
  await card.evaluate(element => { for (const animation of element.getAnimations({ subtree: true })) { animation.pause(); animation.currentTime = 1000; } });
  await page.screenshot({ path });
  await card.evaluate(element => { for (const animation of element.getAnimations({ subtree: true })) animation.play(); });
}

test("activities spend Stamina, advance the right skills and persist on the profile", async ({ page }) => {
  const own = await createTestAccount("activities");
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    testSql("update public.characters set stamina_updated_at=clock_timestamp()+interval '1 day' where id='" + own.id + "';");
    await loginTestAccount(page, own);
    await page.getByRole("navigation", { name: "Harbor locations" }).getByRole("link", { name: "Activities", exact: true }).click();
    await expect(page).toHaveURL(/\/activities$/);
    const stamina = page.getByRole("progressbar", { name: "Stamina", exact: true });
    const fish = page.getByRole("button", { name: "Fish for 1 Stamina", exact: true });
    for (let count = 1; count <= 20; count++) {
      await fish.click();
      await expect(stamina).toHaveAttribute("aria-valuenow", String(50 - count));
      await expect(page.getByLabel("Shore Fishing XP", { exact: true })).toHaveText(String(10 * count));
    }
    // Every XP gain shows in the shared drop at the bottom right; a new gain replaces it and it fades after five seconds.
    const fishingDrop = page.getByRole("region", { name: "Fishing XP gained", exact: true });
    await expect(fishingDrop).toContainText("+10 XP");
    await expect(fishingDrop).toContainText("Level up! Now level 2.");
    await expect(fishingDrop.getByRole("progressbar", { name: "Fishing progress to next level", exact: true })).toHaveAttribute("aria-valuetext", "216 XP to level 3");
    await expect(page.getByRole("region", { name: "Shore Fishing", exact: true })).not.toContainText("XP.");
    // The page reserves a scrollbar gutter, which fixed positioning measures from.
    expect(await page.locator(".o-xp-drop-region").evaluate(element => {
      const box = element.getBoundingClientRect(), root = document.documentElement;
      return Math.max(root.getBoundingClientRect().right - box.right, root.clientHeight - box.bottom);
    })).toBeLessThanOrEqual(20);
    await xpDropShot(page, ".local/xp-drop-desktop.png");
    await page.setViewportSize({ width: 375, height: 812 });
    await page.getByRole("button", { name: "Forage for 1 Stamina", exact: true }).click();
    await expect(stamina).toHaveAttribute("aria-valuenow", "29");
    await expect(page.getByLabel("Foraging XP", { exact: true })).toHaveText("10");
    await expect(page.getByRole("region", { name: "Foraging XP gained", exact: true })).toContainText("+10 XP");
    await expect(fishingDrop).toHaveCount(0);
    await xpDropShot(page, ".local/xp-drop-mobile.png");
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(page.locator(".o-xp-drop")).toHaveCount(0, { timeout: 8000 });
    const foragingResult = page.getByRole("region", { name: "Foraging result", exact: true });
    await expect(foragingResult.getByRole("heading", { name: "Success", exact: true })).toBeVisible();
    await expect(foragingResult.getByRole("list", { name: "Activity rewards" })).toHaveCount(0);
    await page.getByRole("button", { name: "Chop trees for 1 Stamina", exact: true }).click();
    await expect(stamina).toHaveAttribute("aria-valuenow", "28");
    await expect(page.getByLabel("Logging XP", { exact: true })).toHaveText("10");
    await expect(page.getByRole("progressbar", { name: "Energy", exact: true })).toHaveAttribute("aria-valuenow", "100");
    for (const width of [1440, 375, 320]) {
      await page.setViewportSize({ width, height: 1100 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(fish).toBeVisible();
      if (width !== 320) await page.screenshot({ path: ".local/activities-" + width + ".png", fullPage: true, animations: "disabled" });
    }
    testSql("update public.characters set stamina=0 where id='" + own.id + "'; select private.notify_training('" + own.id + "');");
    await expect(fish).toBeDisabled();
    await expect(page.getByText("You need 1 Stamina to do an activity. Stamina recovers over time.")).toBeVisible();
    testSql("update public.characters set stamina_updated_at=clock_timestamp()-interval '1 day' where id='" + own.id + "'; select private.notify_training('" + own.id + "');");
    await expect(fish).toBeEnabled();
    await expect(stamina).toHaveAttribute("aria-valuenow", "50");
    await page.getByRole("link", { name: "My Profile", exact: true }).click();
    await expect(page.getByLabel("Fishing level", { exact: true })).toHaveText("2");
    await expect(page.getByLabel("Fishing XP", { exact: true })).toHaveText("200");
    await expect(page.getByLabel("Character Level", { exact: true })).toHaveText("8");
    expect(errors).toEqual([]);
  } finally { await cleanupTestAccounts([own]); }
});

test("concurrent activity requests cannot duplicate rewards or overspend Stamina", async () => {
  const own = await createTestAccount("activities-concurrent");
  try {
    testSql("update public.characters set stamina_updated_at=clock_timestamp()+interval '1 day' where id='" + own.id + "';");
    const request_id = crypto.randomUUID();
    const duplicate = await Promise.all(Array.from({ length: 8 }, () => own.api.rpc("perform_activity", { ...offer, request_id })));
    expect(duplicate.every(result => !result.error && JSON.stringify(result.data) === JSON.stringify(duplicate[0].data))).toBe(true);
    expect((await own.api.rpc("get_game_state")).data!.stamina).toBe(49);
    const conflict = await own.api.rpc("perform_activity", { ...offer, activity_id: "coastal_foraging", request_id });
    expect(conflict.error?.message).toBe("REQUEST_CONFLICT");
    testSql("update public.characters set stamina=3 where id='" + own.id + "';");
    const requests = await Promise.all(Array.from({ length: 10 }, () => own.api.rpc("perform_activity", { ...offer, request_id: crypto.randomUUID() })));
    expect(requests.filter(result => !result.error)).toHaveLength(3);
    expect(requests.filter(result => result.error?.message === "INSUFFICIENT_STAMINA")).toHaveLength(7);
    expect((await own.api.rpc("get_game_state")).data!.stamina).toBe(0);
    expect((await own.api.rpc("get_own_skills")).data!.skills.find(skill => skill.id === "fishing")).toMatchObject({ xp: 40, level: 1 });
    expect(testSql("select count(*) from private.activity_requests where character_id='" + own.id + "';").trim()).toBe("4");
  } finally { await cleanupTestAccounts([own]); }
});

test("a committed activity with a lost response can be recovered without a second charge", async ({ page }) => {
  const own = await createTestAccount("activities-recovery");
  try {
    testSql("update public.characters set stamina_updated_at=clock_timestamp()+interval '1 day' where id='" + own.id + "';");
    await loginTestAccount(page, own);
    const request_id = crypto.randomUUID();
    const committed = await own.api.rpc("perform_activity", { ...offer, request_id });
    expect(committed.error).toBeNull();
    await page.evaluate(({ key, request_id }) => localStorage.setItem(key, JSON.stringify({ kind: "activity", id: request_id,
      fields: { request_id, activity_id: "shore_fishing", stamina_cost: "1", xp_gain: "10" } })), { key: economyJournalKey(own.id), request_id });
    await page.goto("/activities");
    await expect(page.getByRole("button", { name: "Fish for 1 Stamina", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Check saved action", exact: true }).click();
    await expect(page.getByRole("region", { name: "Unconfirmed action", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Fish for 1 Stamina", exact: true })).toBeEnabled();
    await expect(page.getByRole("progressbar", { name: "Stamina", exact: true })).toHaveAttribute("aria-valuenow", "49");
    await expect(page.getByLabel("Shore Fishing XP", { exact: true })).toHaveText("10");
    expect(testSql("select count(*) from private.activity_requests where character_id='" + own.id + "';").trim()).toBe("1");
  } finally { await cleanupTestAccounts([own]); }
});

test("activity result expands for misses, item rewards and future Gold Coins", async ({ page }) => {
  const own = await createTestAccount("activity-result");
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    const requestId = crypto.randomUUID();
    const saved = await own.api.rpc("perform_activity", { ...offer, request_id: requestId });
    expect(saved.error).toBeNull();
    await loginTestAccount(page, own);
    await page.goto("/activities");
    await page.evaluate(id => { Object.defineProperty(crypto, "randomUUID", { configurable: true, value: () => id }); }, requestId);
    // Replay presentation fixtures belonging only to this disposable character.
    const fixture = (extra: Record<string, unknown>) => {
      const receipt = JSON.stringify({ ...saved.data!, ...extra }).replaceAll("'", "''");
      testSql("update private.activity_requests set result='" + receipt + "'::jsonb where character_id='" + own.id + "' and request_id='" + requestId + "'");
    };
    const button = page.getByRole("button", { name: "Fish for 1 Stamina", exact: true });
    const result = page.getByRole("region", { name: "Shore Fishing result", exact: true });
    await expect(result).toHaveCount(0);
    fixture({ loot: { caught: false } });
    await button.click();
    await expect(result.getByRole("heading", { name: "Failure", exact: true })).toBeVisible();
    await expect(result).toContainText("Spent 1 Stamina.");
    // A replayed receipt awards nothing new, so no XP drop appears.
    await expect(page.locator(".o-xp-drop")).toHaveCount(0);
    await expect(result.getByRole("list", { name: "Activity rewards" })).toHaveCount(0);
    await page.screenshot({ path: ".local/activity-failure.png", fullPage: true, animations: "disabled" });
    const items = [
      { item_id: "fixture_fish", name: "Silver Fish", image_path: "", quantity: 2 },
      { item_id: "fixture_ring", name: "Golden Ring", image_path: "/images/items/placeholder.svg", quantity: 1 },
      { item_id: "fixture_shell", name: "Seashell", image_path: "/images/items/placeholder.svg", quantity: 3 },
    ];
    fixture({ outcome: "success", rewards: { items, gold_coins: 1251 } });
    await button.click();
    await expect(result.getByRole("heading", { name: "Success", exact: true })).toBeVisible();
    await expect(result.getByText("1,251 Gold Coins", { exact: true })).toBeVisible();
    await expect(result.getByRole("listitem")).toHaveCount(4);
    const fishReward = result.getByRole("button", { name: "2 × Silver Fish", exact: true });
    await expect(fishReward.locator("img")).toHaveAttribute("src", /placeholder.svg$/);
    await fishReward.hover();
    await expect(result.getByRole("tooltip")).toHaveText("Silver Fish");
    await button.hover();
    await expect(result.getByRole("tooltip")).toHaveCount(0);
    await fishReward.focus();
    await expect(result.getByRole("tooltip")).toHaveText("Silver Fish");
    await page.keyboard.press("Escape");
    await expect(result.getByRole("tooltip")).toHaveCount(0);
    for (const width of [1440, 375, 320]) {
      await page.setViewportSize({ width, height: 1100 });
      const ringReward = result.getByRole("button", { name: "1 × Golden Ring", exact: true });
      await ringReward.click();
      await expect(result.getByRole("tooltip")).toHaveText("Golden Ring");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const bounds = await result.getByRole("tooltip").boundingBox({ timeout: 5000 });
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      if (width !== 320) await page.screenshot({ path: ".local/activity-rewards-" + width + ".png", fullPage: true, animations: "disabled" });
    }
    await result.getByRole("button", { name: "Close Shore Fishing result", exact: true }).click();
    await expect(result).toHaveCount(0);
    await expect(button).toBeFocused();
    fixture({ outcome: "success", rewards: { gold_coins: 251 } });
    await button.click();
    await expect(result.getByText("251 Gold Coins", { exact: true })).toBeVisible();
    await expect(result.getByRole("listitem")).toHaveCount(1);
    expect(testSql("select count(*) from private.activity_requests where character_id='" + own.id + "'").trim()).toBe("1");
    expect(errors).toEqual([]);
  } finally { await cleanupTestAccounts([own]); }
});
