import { test, expect } from "@playwright/test";
import { createTestAccount, cleanupTestAccounts, loginTestAccount, testSql } from "../support/accounts";
import { economyJournalKey } from "../../src/lib/economy-journal";

const offer = { activity_id: "shore_fishing", expected_stamina_cost: 1, expected_xp_gain: 10 };

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
    for (let count = 1; count <= 9; count++) {
      await fish.click();
      await expect(stamina).toHaveAttribute("aria-valuenow", String(50 - count));
      await expect(page.getByLabel("Shore Fishing XP", { exact: true })).toHaveText(String(10 * count));
    }
    await expect(page.getByRole("region", { name: "Shore Fishing", exact: true })).toContainText("Fishing reached level 2!");
    await page.getByRole("button", { name: "Forage for 1 Stamina", exact: true }).click();
    await expect(stamina).toHaveAttribute("aria-valuenow", "40");
    await expect(page.getByLabel("Foraging XP", { exact: true })).toHaveText("10");
    await page.getByRole("button", { name: "Chop trees for 1 Stamina", exact: true }).click();
    await expect(stamina).toHaveAttribute("aria-valuenow", "39");
    await expect(page.getByLabel("Logging XP", { exact: true })).toHaveText("10");
    await expect(page.getByRole("progressbar", { name: "Energy", exact: true })).toHaveAttribute("aria-valuenow", "100");
    for (const width of [1440, 375, 320]) {
      await page.setViewportSize({ width, height: 1100 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(fish).toBeVisible();
      if (width !== 320) await page.screenshot({ path: ".local/activities-" + width + ".png", fullPage: true });
    }
    testSql("update public.characters set stamina=0 where id='" + own.id + "'; select private.notify_training('" + own.id + "');");
    await expect(fish).toBeDisabled();
    await expect(page.getByText("You need 1 Stamina to do an activity. Stamina recovers over time.")).toBeVisible();
    testSql("update public.characters set stamina_updated_at=clock_timestamp()-interval '1 day' where id='" + own.id + "'; select private.notify_training('" + own.id + "');");
    await expect(fish).toBeEnabled();
    await expect(stamina).toHaveAttribute("aria-valuenow", "50");
    await page.getByRole("link", { name: "My Profile", exact: true }).click();
    await expect(page.getByLabel("Fishing level", { exact: true })).toHaveText("2");
    await expect(page.getByLabel("Fishing XP", { exact: true })).toHaveText("90");
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
