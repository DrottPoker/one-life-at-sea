import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createTestAccount, testSql as sql,
  loginTestAccount as login, cleanupTestAccounts as cleanup } from "../support/accounts";

const captain = () => createTestAccount("hospital");

test("hospital locks gameplay routes, updates other players and discharges online and offline captains", async ({ page, browser, context }) => {
  test.setTimeout(120_000);
  const own = await captain(), observer = await captain();
  const observerContext = await browser.newContext(), visitor = await observerContext.newPage();
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    sql("update public.characters set gold_coins=1000,bank_gold_coins=500,crew_attack=42 where id='" + own.id + "'");
    await login(page, own);
    await login(visitor, observer);
    await visitor.getByRole("navigation", { name: "Harbor locations" }).getByRole("link", { name: "Hospital", exact: true }).click();
    await expect(visitor.getByRole("heading", { name: "Hospital", exact: true })).toBeVisible();
    await page.goto("/harbor/bank");
    sql("update public.characters set crew_health=0 where id='" + own.id + "'");
    await expect(page).toHaveURL(/\/harbor\/hospital$/, { timeout: 20000 });
    await expect(page.getByRole("heading", { name: "You are in hospital", exact: true })).toBeVisible();
    await expect(page.getByLabel("Hospital time remaining", { exact: true })).toHaveText(/^[0-5]:\d{2}$/);
    await expect(visitor.getByRole("list", { name: "Captains in hospital" }).getByText(own.name, { exact: true })).toBeVisible({ timeout: 20000 });
    expect((await own.api.rpc("train_crew", { stat: "attack", expected_tier_id: "crew_1", request_id: randomUUID() })).error?.message).toBe("IN_HOSPITAL");
    expect((await own.api.rpc("transfer_gold", { direction: "withdraw", amount: 10, request_id: randomUUID() })).error?.message).toBe("IN_HOSPITAL");
    for (const route of ["/harbor/crew-training", "/harbor/ship-upgrades", "/harbor/bank", "/harbor/marketplace",
      "/attack/" + observer.id, "/harbor"]) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/harbor\/hospital$/);
    }
    const nav = page.getByRole("navigation", { name: "Harbor locations" });
    await expect(nav.getByRole("link", { name: "Bank", exact: true })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Crew Training", exact: true })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Ship Upgrades", exact: true })).toHaveCount(0);
    const second = await context.newPage();
    await second.goto("/harbor/bank");
    await expect(second).toHaveURL(/\/harbor\/hospital$/);
    await second.close();
    for (const width of [1280, 768, 375, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.screenshot({ path: ".local/hospital-desktop.png", fullPage: true });
    await page.setViewportSize({ width: 375, height: 1000 });
    await page.screenshot({ path: ".local/hospital-mobile.png", fullPage: true });
    await page.getByRole("button", { name: "Log out", exact: true }).filter({ visible: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await login(page, own, true);
    sql("update public.characters set hospital_started_at=clock_timestamp()-interval '5 minutes',hospital_until=clock_timestamp()+interval '5 seconds' where id='" + own.id + "'");
    await page.reload();
    await expect(page).toHaveURL(/\/harbor$/, { timeout: 20000 });
    await expect(visitor.getByRole("list", { name: "Captains in hospital" }).getByText(own.name, { exact: true })).toHaveCount(0, { timeout: 20000 });
    expect((await own.api.rpc("get_game_state")).data).toMatchObject({
      hospital_until: null, ship_health: 100, crew_health: 100, crew_attack: 42, gold_coins: 1000, bank_gold_coins: 500,
    });
    await page.goto("/harbor/bank");
    await expect(page.getByRole("heading", { name: "Bank", exact: true })).toBeVisible();
    expect((await own.api.rpc("transfer_gold", { direction: "deposit", amount: 10, request_id: randomUUID() })).error).toBeNull();
    // Offline expiry removes the patient without a read from that character.
    await page.getByRole("button", { name: "Log out", exact: true }).filter({ visible: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    sql("update public.characters set ship_health=0 where id='" + own.id + "'");
    await expect(visitor.getByRole("list", { name: "Captains in hospital" }).getByText(own.name, { exact: true })).toBeVisible({ timeout: 20000 });
    sql("update public.characters set hospital_started_at=clock_timestamp()-interval '5 minutes',hospital_until=clock_timestamp()+interval '3 seconds' where id='" + own.id + "'");
    await expect(visitor.getByRole("list", { name: "Captains in hospital" }).getByText(own.name, { exact: true })).toHaveCount(0, { timeout: 20000 });
    await login(page, own);
    await expect(page.getByRole("progressbar", { name: "Crew Health", exact: true })).toHaveAttribute("aria-valuenow", "100");
    expect(errors).toEqual([]);
  } finally {
    await observerContext.close();
    await cleanup([own, observer]);
  }
});

test("PvP sinking sends an online defender and a defeated attacker directly to hospital", async ({ page, browser }) => {
  const a = await captain(), d = await captain(), killer = await captain();
  const defenderContext = await browser.newContext(), defender = await defenderContext.newPage();
  try {
    sql("update public.characters set ship_attack=1000000,ship_accuracy=1000000,ship_defense=1000000000 where id in('" + a.id + "','" + killer.id + "')");
    await login(page, a);
    await login(defender, d);
    await defender.goto("/harbor/bank");
    await page.goto("/attack/" + d.id);
    await page.getByRole("button", { name: "Start battle 10 Energy", exact: true }).click();
    await page.getByRole("button", { name: /^Fire cannons 1 salvo/ }).click();
    await expect(page).toHaveURL(/\/combatlog\/[0-9a-f-]+$/);
    await expect(defender).toHaveURL(/\/harbor\/hospital$/, { timeout: 20000 });
    expect((await d.api.rpc("get_game_state")).data).toMatchObject({ ship_health: 0, crew_health: 0 });
    await expect(defender.getByRole("list", { name: "Captains in hospital" }).getByText(d.name, { exact: true })).toBeVisible();
    sql("update public.characters set ship_attack=1,ship_accuracy=1,ship_defense=1,ship_speed=1 where id='" + a.id + "'");
    await page.goto("/attack/" + killer.id);
    await page.getByRole("button", { name: "Start battle 10 Energy", exact: true }).click();
    await page.getByRole("button", { name: /^Fire cannons 1 salvo/ }).click();
    await expect(page).toHaveURL(/\/harbor\/hospital$/, { timeout: 20000 });
    await expect(page.getByRole("heading", { name: "You are in hospital", exact: true })).toBeVisible();
    expect((await a.api.rpc("get_game_state")).data).toMatchObject({ ship_health: 0, crew_health: 0, active_attack: null });
  } finally {
    await defenderContext.close();
    await cleanup([a, d, killer]);
  }
});

test("a visitor admitted while already viewing hospital is automatically discharged", async ({ page }) => {
  const own = await captain();
  try {
    await login(page, own);
    await page.goto("/harbor/hospital");
    await expect(page.getByRole("heading", { name: "A place to recover", exact: true })).toBeVisible();
    sql("update public.characters set crew_health=0 where id='" + own.id + "'");
    await expect(page.getByRole("heading", { name: "You are in hospital", exact: true })).toBeVisible({ timeout: 20000 });
    sql("update public.characters set hospital_started_at=clock_timestamp()-interval '5 minutes',hospital_until=clock_timestamp()+interval '4 seconds' where id='" + own.id + "'");
    await expect(page).toHaveURL(/\/harbor$/, { timeout: 20000 });
    await expect(page.getByRole("progressbar", { name: "Crew Health", exact: true })).toHaveAttribute("aria-valuenow", "100");
  } finally { await cleanup([own]); }
});

test("hospital profiles stay accessible and show a live public countdown until discharge", async ({ page, browser, context }) => {
  test.setTimeout(90000);
  const own = await captain(), observer = await captain();
  const observerContext = await browser.newContext(), visitor = await observerContext.newPage();
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  visitor.on("pageerror", error => errors.push(error.message));
  try {
    await login(page, own);
    await login(visitor, observer);
    await visitor.goto("/characters/" + own.id);
    const theirProfile = visitor.getByRole("main"), myProfile = page.getByRole("main");
    await expect(theirProfile.getByText("In hospital", { exact: true })).toHaveCount(0);
    sql("update public.characters set crew_health=0 where id='" + own.id + "'");
    await expect(page).toHaveURL(/\/harbor\/hospital$/, { timeout: 20000 });
    await expect(theirProfile.getByText("In hospital", { exact: true })).toBeVisible({ timeout: 20000 });
    await expect(theirProfile.getByRole("button", { name: "Attack", exact: true })).toBeDisabled();
    const clock = theirProfile.getByLabel("Hospital time remaining", { exact: true });
    await expect(clock).toHaveText(/^[0-5]:\d{2}$/);
    const time = await clock.textContent();
    await expect(clock).not.toHaveText(time!);
    await page.getByRole("link", { name: "My Profile", exact: true }).click();
    await expect(page).toHaveURL("/players/" + own.playerNumber);
    await expect(myProfile.getByText("In hospital", { exact: true })).toBeVisible();
    await expect(myProfile.getByLabel("Hospital time remaining", { exact: true })).toHaveText(/^[0-5]:\d{2}$/);
    await expect(page.getByRole("button", { name: "Save orders", exact: true })).toBeDisabled();
    await expect(page.getByLabel("At sea", { exact: true })).toBeDisabled();
    expect((await own.api.rpc("save_defence_orders", { preset: "boarding" })).error?.message).toBe("IN_HOSPITAL");
    await page.reload();
    await expect(page).toHaveURL("/players/" + own.playerNumber);
    const second = await context.newPage();
    await second.goto("/characters/" + own.id);
    await expect(second.getByRole("main").getByText("In hospital", { exact: true })).toBeVisible();
    await second.close();
    for (const width of [1280, 375, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (width !== 320) await page.screenshot({ path: ".local/hospital-profile-" + width + ".png", fullPage: true });
    }
    await page.getByRole("link", { name: "Back to Hospital", exact: true }).click();
    await expect(page).toHaveURL(/\/harbor\/hospital$/);
    await page.getByRole("list", { name: "Captains in hospital" }).getByRole("link", { name: own.name, exact: true }).click();
    await expect(page).toHaveURL("/players/" + own.playerNumber);
    await page.goto("/characters/" + observer.id);
    await expect(page).toHaveURL("/players/" + observer.playerNumber);
    await expect(page.getByRole("button", { name: "Attack", exact: true })).toBeDisabled();
    await expect(page.getByRole("main").getByText("In hospital", { exact: true })).toHaveCount(0);
    await page.goto("/characters/" + own.id);
    sql("update public.characters set hospital_started_at=clock_timestamp()-interval '5 minutes',hospital_until=clock_timestamp()+interval '4 seconds' where id='" + own.id + "'");
    await expect(myProfile.getByText("In hospital", { exact: true })).toHaveCount(0, { timeout: 20000 });
    await expect(theirProfile.getByText("In hospital", { exact: true })).toHaveCount(0, { timeout: 20000 });
    await expect(page.getByRole("button", { name: "Save orders", exact: true })).toBeEnabled();
    await expect(theirProfile.getByRole("link", { name: "Attack", exact: true })).toBeVisible();
    await expect(page).toHaveURL("/players/" + own.playerNumber);
    // An offline patient's expiry also clears from someone else's open profile.
    await page.getByRole("button", { name: "Log out", exact: true }).filter({ visible: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    sql("update public.characters set crew_health=0 where id='" + own.id + "'");
    await expect(theirProfile.getByText("In hospital", { exact: true })).toBeVisible({ timeout: 20000 });
    sql("update public.characters set hospital_started_at=clock_timestamp()-interval '5 minutes',hospital_until=clock_timestamp()+interval '3 seconds' where id='" + own.id + "'");
    await expect(theirProfile.getByLabel("Hospital time remaining", { exact: true })).toHaveCount(0, { timeout: 20000 });
    expect(errors).toEqual([]);
  } finally {
    await observerContext.close();
    await cleanup([own, observer]);
  }
});
