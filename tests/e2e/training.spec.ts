import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { isLocalTestApi, localDatabaseContainer } from "../support/local";

process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
if (!isLocalTestApi(url)) throw new Error("Training tests require local Supabase.");
const client = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
function fixture(id: string, statements: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("Invalid fixture ID.");
  execFileSync("docker", ["exec", localDatabaseContainer, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1",
    "-c", statements.replaceAll(":captain", "'" + id + "'")], { stdio: ["ignore", "pipe", "pipe"] });
}
async function account() {
  const api = client(), tag = randomBytes(10).toString("hex");
  const email = "training-" + tag + "@example.test", password = randomBytes(24).toString("hex");
  expect((await api.auth.signUp({ email, password, options: { data: { character_name: "Sailor " + tag } } })).error).toBeNull();
  const own = await api.from("characters").select("id").single();
  expect(own.error).toBeNull();
  return { api, id: own.data!.id as string, email, password };
}
async function login(page: Page, own: Awaited<ReturnType<typeof account>>) {
  await page.goto("/login");
  await page.getByLabel("Email address", { exact: true }).fill(own.email);
  await page.getByLabel("Password", { exact: true }).fill(own.password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/harbor$/);
}

test("crew XP, carried-gold purchases, two tabs, login and responsive layout", async ({ page, context }) => {
  test.setTimeout(120_000);
  const own = await account(), errors: string[] = [];
  page.on("pageerror", e => errors.push(e.name));
  fixture(own.id, "update public.characters set bank_gold_coins=1000 where id=:captain;");
  await login(page, own);
  await page.goto("/harbor/crew-training");
  const other = await context.newPage();
  await other.goto("/harbor/crew-training");
  for (const [index, stat] of ["Attack", "Defense", "Speed", "Accuracy"].entries()) {
    await page.getByRole("button", { name: "Train " + stat + " for 5 Energy", exact: true }).click();
    await expect(page.getByLabel(stat + " stat", { exact: true })).toHaveText(/^1[12]$/);
    await expect(page.getByRole("progressbar", { name: "Energy", exact: true })).toHaveAttribute("aria-valuenow", String(95 - index * 5));
  }
  await expect(page.getByRole("progressbar", { name: "Crew progress", exact: true })).toHaveAttribute("value", "20");
  await expect(other.getByRole("progressbar", { name: "Crew progress", exact: true })).toHaveAttribute("value", "20");
  const results = await Promise.all(Array.from({ length: 16 }, () => own.api.rpc("train_crew", {
    stat: "attack", expected_tier_id: "crew_1", request_id: randomUUID(),
  })));
  expect(results.every(r => !r.error)).toBe(true);
  await expect(page.getByRole("progressbar", { name: "Crew progress", exact: true })).toHaveAttribute("value", "100");
  await expect(page.getByRole("main")).not.toContainText(/\bXP\b|earned|more XP required/);
  const buy = page.getByRole("button", { name: "Buy for 250 Gold Coins", exact: true });
  await expect(buy).toBeDisabled();
  expect((await own.api.rpc("purchase_training_tier", { training_group: "crew", tier_id: "crew_2", request_id: randomUUID() })).error?.message).toBe("NOT_ENOUGH_GOLD");
  expect((await own.api.rpc("transfer_gold", { direction: "withdraw", amount: 250, request_id: randomUUID() })).error).toBeNull();
  await expect(buy).toBeEnabled();
  await buy.click();
  await expect(page.getByText("Harbor Exercises purchased for 250 Gold Coins.", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Harbor Exercises", exact: true })).toBeVisible();
  await expect(other.getByRole("heading", { name: "Harbor Exercises", exact: true })).toBeVisible();
  await expect(page.getByLabel("Gold Coins on character", { exact: true })).toHaveText("0");
  expect((await own.api.rpc("get_game_state")).data.bank_gold_coins).toBe(750);
  for (const width of [1280, 768, 375, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.screenshot({ path: ".local/crew-training-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 375, height: 1000 });
  await page.screenshot({ path: ".local/crew-training-mobile.png", fullPage: true });
  await other.close();
  await page.getByRole("button", { name: "Log out", exact: true }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await login(page, own);
  await page.goto("/harbor/crew-training");
  await expect(page.getByRole("heading", { name: "Harbor Exercises", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Train Attack for 5 Energy", exact: true })).toBeDisabled();
  fixture(own.id, "update public.characters set energy=4,energy_updated_at=clock_timestamp()-interval '4 minutes 55 seconds' where id=:captain;");
  await page.reload();
  await expect(page.getByRole("button", { name: "Train Attack for 5 Energy", exact: true })).toBeEnabled({ timeout: 15000 });
  const before = (await own.api.rpc("get_game_state")).data.crew_attack;
  await page.getByRole("button", { name: "Train Attack for 5 Energy", exact: true }).click();
  await expect(page.getByLabel("Attack stat", { exact: true })).toHaveText(new RegExp("^(" + (before + 2) + "|" + (before + 4) + ")$"));
  expect(errors).toEqual([]);
  await own.api.auth.signOut();
});

test("ship sizes complete automatically, preserve work after login and update another tab", async ({ page, context }) => {
  test.setTimeout(120_000);
  const own = await account();
  await login(page, own);
  await page.goto("/harbor/ship-upgrades");
  const other = await context.newPage();
  await other.goto("/harbor/ship-upgrades");
  let attack = 10, xp = 0, energy = 100;
  for (const [size, cost, gain] of [["small", 5, 1], ["medium", 25, 5], ["large", 50, 10]] as const) {
    await expect(page.getByRole("main")).not.toContainText(/\bXP\b|earned|more XP required/);
    await page.getByLabel("Work size", { exact: true }).selectOption(size);
    await page.getByRole("button", { name: "Start work", exact: true }).click();
    energy -= cost;
    await expect(page.getByRole("region", { name: "Ship work in progress" })).toBeVisible();
    await expect(page.getByLabel("Attack stat", { exact: true })).toHaveText(String(attack));
    await expect(page.getByRole("progressbar", { name: "Energy", exact: true })).toHaveAttribute("aria-valuenow", String(energy));
    await expect(other.getByRole("region", { name: "Ship work in progress" })).toBeVisible();
    if (size === "small") {
      await page.reload();
      await expect(page.getByRole("region", { name: "Ship work in progress" })).toBeVisible();
      for (const width of [1280, 768, 375, 320]) {
        await page.setViewportSize({ width, height: 1000 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
      await page.setViewportSize({ width: 1280, height: 1000 });
      await page.screenshot({ path: ".local/ship-work-desktop.png", fullPage: true });
      await page.setViewportSize({ width: 375, height: 1000 });
      await page.screenshot({ path: ".local/ship-work-mobile.png", fullPage: true });
    }
    fixture(own.id, "update private.ship_upgrade_jobs set started_at=clock_timestamp()-interval '1 minute',finishes_at=clock_timestamp()+interval '4 seconds' where character_id=:captain and applied_at is null;");
    await page.reload();
    attack += gain; xp += cost;
    await expect(page.getByLabel("Attack stat", { exact: true })).toHaveText(String(attack), { timeout: 15000 });
    await expect(page.getByRole("progressbar", { name: "Workshop progress", exact: true })).toHaveAttribute("value", String(xp));
    await expect(other.getByLabel("Attack stat", { exact: true })).toHaveText(String(attack), { timeout: 15000 });
    await expect(page.getByText("Last job completed: +" + gain + " Attack.", { exact: true })).toBeVisible();
  }
  await page.screenshot({ path: ".local/ship-work-completed-mobile.png", fullPage: true });
  await other.close();
  await page.getByRole("button", { name: "Log out", exact: true }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await login(page, own);
  await page.goto("/harbor/ship-upgrades");
  await expect(page.getByLabel("Attack stat", { exact: true })).toHaveText("26");
  await own.api.auth.signOut();
});

test("concurrent drills, purchases and ship starts cannot overspend or duplicate rewards", async () => {
  const own = await account(), other = await account();
  expect((await own.api.from("characters").update({ energy: 100, crew_attack: 999 }).not("id", "is", null)).error?.code).toBe("42501");
  expect((await own.api.rpc("train_crew", { stat: "health", expected_tier_id: "crew_1", request_id: randomUUID() })).error?.code).toBe("22023");
  const results = await Promise.all(Array.from({ length: 25 }, () => own.api.rpc("train_crew", {
    stat: "attack", expected_tier_id: "crew_1", request_id: randomUUID(),
  })));
  const successful = results.filter(r => !r.error);
  expect(successful).toHaveLength(20);
  expect(results.filter(r => r.error?.message === "NOT_ENOUGH_ENERGY")).toHaveLength(5);
  expect((await own.api.rpc("get_game_state")).data).toMatchObject({
    energy: 0, crew_attack: 10 + successful.reduce((sum, r) => sum + r.data.stat_gain, 0),
    training: { progress: { crew: { xp: 100, tier_id: "crew_1" }, ship: { xp: 0 } } },
  });
  fixture(own.id, "update public.characters set gold_coins=1000,energy=100,energy_updated_at=clock_timestamp() where id=:captain;");
  const request = randomUUID();
  const purchases = await Promise.all(Array.from({ length: 8 }, () => own.api.rpc("purchase_training_tier", {
    training_group: "crew", tier_id: "crew_2", request_id: request,
  })));
  expect(purchases.every(r => !r.error)).toBe(true);
  expect((await own.api.rpc("get_game_state")).data.gold_coins).toBe(750);
  const crewId = randomUUID();
  const drills = await Promise.all(Array.from({ length: 8 }, () => own.api.rpc("train_crew", {
    stat: "speed", expected_tier_id: "crew_2", request_id: crewId,
  })));
  expect(drills.every(r => !r.error && JSON.stringify(r.data) === JSON.stringify(drills[0].data))).toBe(true);
  expect((await own.api.rpc("get_game_state")).data.energy).toBe(95);
  const starts = await Promise.all(Array.from({ length: 8 }, () => own.api.rpc("start_ship_upgrade", {
    stat: "attack", size_id: "large", expected_workshop_id: "ship_1", request_id: randomUUID(),
  })));
  expect(starts.filter(r => !r.error)).toHaveLength(1);
  expect(starts.filter(r => r.error?.message === "SHIP_WORK_ACTIVE")).toHaveLength(7);
  expect((await own.api.rpc("get_game_state")).data.energy).toBe(45);
  fixture(own.id, "update private.ship_upgrade_jobs set started_at=clock_timestamp()-interval '1 hour',finishes_at=clock_timestamp()-interval '1 second' where character_id=:captain and applied_at is null;");
  const reads = await Promise.all(Array.from({ length: 8 }, () => own.api.rpc("get_game_state")));
  expect(reads.every(r => !r.error && r.data.ship_attack === 20 && r.data.training.progress.ship.xp === 50)).toBe(true);
  expect((await other.api.rpc("get_game_state")).data).toMatchObject({ energy: 100, crew_attack: 10, ship_attack: 10 });
  expect((await client().rpc("train_crew", { stat: "attack", expected_tier_id: "crew_1", request_id: randomUUID() })).error?.code).toBe("42501");
  expect((await own.api.rpc("train_stat", { training_group: "ship", stat: "attack" })).error).not.toBeNull();
  await own.api.auth.signOut(); await other.api.auth.signOut();
});

test("a lost crew response retries the original drill without a second charge or roll", async ({ page }) => {
  const own = await account();
  await login(page, own);
  await page.goto("/harbor/crew-training");
  let dropped = false;
  await page.route("**/harbor/crew-training", async route => {
    if (!dropped && route.request().method() === "POST" && route.request().headers()["next-action"]) {
      dropped = true; await route.fetch(); await route.abort("failed");
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Train Attack for 5 Energy", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry action", exact: true })).toBeVisible();
  const before = (await own.api.rpc("get_game_state")).data;
  expect(before.energy).toBe(95);
  expect(before.training.progress.crew.xp).toBe(5);
  await page.getByRole("button", { name: "Retry action", exact: true }).click();
  await expect(page.getByText(/Crew Attack \+[12]\. Spent 5 Energy\./)).toBeVisible();
  const after = (await own.api.rpc("get_game_state")).data;
  expect(after.energy).toBe(95);
  expect(after.crew_attack).toBe(before.crew_attack);
  expect(after.training.progress.crew.xp).toBe(5);
  await own.api.auth.signOut();
});
