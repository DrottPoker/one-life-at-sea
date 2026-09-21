import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createTestAccount, cleanupTestAccounts, loginTestAccount, testSql } from "../support/accounts";
import { crewTrainingStatGain } from "../../src/lib/training";
import { formatStatGain } from "../../src/lib/format";

type Captain = Awaited<ReturnType<typeof createTestAccount>>;
const accounts: Captain[] = [];
async function captain() {
  const own = await createTestAccount("morale");
  accounts.push(own);
  testSql("update public.characters set gold_coins=10000,morale_updated_at=clock_timestamp()+interval '1 day' where id='" + own.id + "';");
  return own;
}
test.afterEach(async () => { await cleanupTestAccounts(accounts.splice(0)); });

test("morale starts in the middle, fills in both directions and updates across tabs", async ({ page, context }) => {
  const own = await captain(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await loginTestAccount(page, own);
  await page.goto("/harbor/tavern");
  const meter = page.getByRole("meter", { name: "Crew Morale", exact: true });
  const fill = meter.locator(".o-resource-track > span");
  await expect(meter).toHaveAttribute("aria-valuenow", "0");
  expect(await fill.evaluate(node => ({ left: (node as HTMLElement).style.left, width: (node as HTMLElement).style.width }))).toEqual({ left: "50%", width: "0%" });
  const other = await context.newPage();
  await other.goto("/harbor/crew-training");
  const meal = page.getByRole("button", { name: "Buy crew meal for 1,000 Gold Coins", exact: true });
  await meal.click();
  await expect(meter).toHaveAttribute("aria-valuenow", "25");
  await expect(page.getByLabel("Gold Coins on character", { exact: true })).toHaveText("9,000");
  await expect(page.getByRole("progressbar", { name: "Energy", exact: true })).toHaveAttribute("aria-valuenow", "100");
  await expect(other.getByRole("meter", { name: "Crew Morale", exact: true })).toHaveAttribute("aria-valuenow", "25");
  expect(await fill.evaluate(node => ({ left: (node as HTMLElement).style.left, width: (node as HTMLElement).style.width }))).toEqual({ left: "50%", width: "12.5%" });
  await expect(page.getByText("Crew meal served. Morale +25.0. Spent 1,000 Gold Coins.", { exact: true })).toBeVisible();
  const train = other.getByRole("button", { name: "Train Attack for 5 Energy", exact: true });
  await expect(train).toHaveText("Train +" + formatStatGain(crewTrainingStatGain(10, 1, 5, 25)));
  await train.click();
  await expect(meter).toHaveAttribute("aria-valuenow", "22.5");
  testSql("update public.characters set crew_morale=-50 where id='" + own.id + "'; select private.notify_training('" + own.id + "');");
  await expect(meter).toHaveAttribute("aria-valuenow", "-50");
  await expect(page.getByLabel("Crew morale value", { exact: true })).toHaveText("-50.0");
  expect(await fill.evaluate(node => ({ left: (node as HTMLElement).style.left, width: (node as HTMLElement).style.width }))).toEqual({ left: "25%", width: "25%" });
  await page.screenshot({ path: ".local/morale-negative-desktop.png", fullPage: true });
  for (const width of [1280, 375, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 375) await page.screenshot({ path: ".local/morale-negative-mobile.png", fullPage: true });
  }
  testSql("update public.characters set crew_morale=95.5 where id='" + own.id + "'; select private.notify_training('" + own.id + "');");
  await expect(page.getByText("This meal raises morale by +4.5, to +100.0. The full meal price applies.", { exact: true })).toBeVisible();
  await meal.click();
  await expect(meter).toHaveAttribute("aria-valuenow", "100");
  await expect(meal).toBeDisabled();
  await expect(page.getByLabel("Gold Coins on character", { exact: true })).toHaveText("8,000");
  await page.screenshot({ path: ".local/morale-positive-mobile.png", fullPage: true });
  await page.reload();
  await expect(meter).toHaveAttribute("aria-valuenow", "100");
  expect(errors).toEqual([]);
  await other.close();
});

test("a meal lost after commit survives reload and cannot charge twice", async ({ page }) => {
  const own = await captain();
  await loginTestAccount(page, own);
  await page.goto("/harbor/tavern");
  let lost = false;
  await page.route("**/harbor/tavern", async route => {
    if (!lost && route.request().method() === "POST" && route.request().headers()["next-action"]) {
      lost = true;
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      await route.abort("failed");
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Buy crew meal for 1,000 Gold Coins", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry meal", exact: true })).toBeVisible();
  await page.reload();
  const recovery = page.getByRole("region", { name: "Unconfirmed action", exact: true });
  await expect(recovery).toBeVisible();
  await recovery.getByRole("button", { name: "Check saved action", exact: true }).click();
  await expect(recovery).toHaveCount(0);
  await expect(page.getByRole("meter", { name: "Crew Morale", exact: true })).toHaveAttribute("aria-valuenow", "25");
  expect((await own.api.rpc("get_game_state")).data).toMatchObject({ gold_coins: 9000, crew_morale: 25, energy: 100 });
});

test("concurrent meals and drills serialize morale and preserve receipt identity", async () => {
  const own = await captain(), id = randomUUID();
  const same = await Promise.all(Array.from({ length: 8 }, () => own.api.rpc("buy_tavern_meal", {
    expected_gold_cost: 1000, expected_morale_gain: 25, request_id: id,
  })));
  expect(same.every(response => !response.error && JSON.stringify(response.data) === JSON.stringify(same[0].data))).toBe(true);
  expect((await own.api.rpc("get_game_state")).data).toMatchObject({ gold_coins: 9000, crew_morale: 25, energy: 100 });
  const requests = await Promise.all([
    ...Array.from({ length: 4 }, () => own.api.rpc("buy_tavern_meal", { expected_gold_cost: 1000, expected_morale_gain: 25, request_id: randomUUID() })),
    ...Array.from({ length: 4 }, () => own.api.rpc("train_crew", { stat: "attack", expected_tier_id: "crew_1", request_id: randomUUID() })),
  ]);
  const meals = requests.slice(0, 4).filter(response => !response.error);
  for (const response of requests) expect([undefined, "MORALE_FULL"]).toContain(response.error?.message);
  const gained = meals.reduce((sum, response) => sum + ("morale_gained" in response.data! ? response.data.morale_gained : 0), 0);
  expect((await own.api.rpc("get_game_state")).data).toMatchObject({
    gold_coins: 9000 - meals.length * 1000, crew_morale: 25 + gained - 10, energy: 80,
  });
});

test("morale shows fixed server deadlines and refreshes across live updates", async ({ page }) => {
  test.setTimeout(45_000);
  const own = await captain();
  testSql("update public.characters set crew_morale=-2.5 where id='" + own.id + "';");
  await loginTestAccount(page, own);
  const meter = page.getByRole("meter", { name: "Crew Morale", exact: true });
  await expect(meter).toHaveAttribute("aria-valuenow", "-2.5");
  await expect(page.getByLabel("Next Morale tick", { exact: true })).toHaveCount(0);
  const deadline = (await own.api.rpc("get_game_state")).data!.morale_next_at;
  expect(new Date(deadline!).getUTCMinutes() % 5).toBe(0);
  expect(new Date(deadline!).getUTCSeconds()).toBe(0);
  testSql("update public.characters set morale_updated_at=clock_timestamp()-interval '1 day' where id='" + own.id + "'; select private.notify_training('" + own.id + "');");
  await expect(meter).toHaveAttribute("aria-valuenow", "0");
  expect((await own.api.rpc("get_game_state")).data!.morale_next_at).toBeNull();
});
