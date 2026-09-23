import { test, expect, type Page } from "@playwright/test";
import { createTestAccount, cleanupTestAccounts, loginTestAccount, testSql } from "../support/accounts";
import type { GameState } from "../../src/lib/game";

type Captain = Awaited<ReturnType<typeof createTestAccount>>;
const accounts: Captain[] = [];
async function captain() {
  const value = await createTestAccount("sea");
  accounts.push(value);
  return value;
}
async function state(own: Captain): Promise<GameState> {
  const result = await own.api.rpc("get_game_state");
  expect(result.error).toBeNull();
  expect(result.data).not.toBeNull();
  return result.data!;
}
// A newly discovered combat peer asks the caller to retry with fresh ordered locks.
async function retryCombatLock<T extends { error: { code: string } | null }>(call: () => PromiseLike<T>): Promise<T> {
  const result = await call();
  return result.error?.code === "40001" ? await call() : result;
}
function due(own: Captain, remaining = -1) {
  testSql("update public.characters set travel_started_at=clock_timestamp()-interval '61 seconds'," +
    "travel_arrives_at=clock_timestamp()+interval '" + remaining + " seconds' where id='" + own.id + "';");
}
async function signBackInAtSea(page: Page, own: Captain) {
  await page.goto("/login");
  await page.getByLabel("Email address", { exact: true }).fill(own.email);
  await page.getByLabel("Password", { exact: true }).fill(own.password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/sea$/);
}
test.afterEach(async () => { await cleanupTestAccounts(accounts.splice(0)); });

test("real timed departure, persistent routes, read-only sea stop, onward travel and offline homecoming", async ({ page, context, browser }) => {
  test.setTimeout(180_000);
  const own = await captain(), observer = await captain(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await loginTestAccount(page, own);
  const other = await context.newPage();
  await other.goto("/harbor/bank");
  const observerContext = await browser.newContext();
  try {
    const watching = await observerContext.newPage();
    await loginTestAccount(watching, observer);
    await watching.goto("/characters/" + own.id);
    await expect(watching.getByRole("link", { name: "Attack", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Set sail", exact: true }).click();
    await expect(page).toHaveURL(/\/sea$/);
    await expect(other).toHaveURL(/\/sea$/);
    await expect(page.getByRole("heading", { name: "Traveling to Outside the harbor" })).toBeVisible();
    await expect(page.getByLabel("Travel time remaining")).toBeVisible();
    const traveling = await state(own);
    expect(traveling.energy).toBe(95);
    expect(Date.parse(traveling.sea.journey!.arrives_at) - Date.parse(traveling.sea.journey!.started_at)).toBe(60_000);
    expect(traveling.energy_next_at).not.toBeNull();
    expect(Date.parse(traveling.energy_next_at!) % 600_000).toBe(0);
    await expect(watching.getByRole("button", { name: "Attack", exact: true })).toBeDisabled();
    await page.goto("/inventory");
    await expect(page).toHaveURL(/\/sea$/);
    await expect(page.getByRole("button", { name: "Return to The Harbor", exact: true })).toHaveCount(0);
    await page.reload();
    await expect(page.getByLabel("Travel time remaining")).toBeVisible();
    await page.getByRole("button", { name: "Log out", exact: true }).filter({ visible: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await signBackInAtSea(page, own);
    await expect(page.getByRole("heading", { name: "Outside the harbor", exact: true })).toBeVisible({ timeout: 70_000 });
    const first = await state(own);
    expect(first.sea.step).toBe(1);
    expect(first.sea.options).toHaveLength(2);
    expect(new Set(first.sea.options.map(p => p.place_id)).size).toBe(2);
    expect(first.energy).toBe(95);
    await page.reload();
    expect((await state(own)).sea.options).toEqual(first.sea.options);
    await page.goto("/inventory");
    await expect(page.getByText("Your inventory is read-only at sea. Return to The Harbor to use it.")).toBeVisible();
    await page.goto("/characters/" + own.id);
    await expect(page.getByRole("button", { name: "Save orders", exact: true })).toBeDisabled();
    await expect(page.getByRole("status", { name: "Max sea distance", exact: true })).toHaveText("1");
    await page.goto("/harbor/crew-training");
    await expect(page).toHaveURL(/\/sea$/);
    for (const width of [1280, 375, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (width !== 320) await page.screenshot({ path: ".local/sea-stop-" + width + ".png", fullPage: true });
    }
    await page.getByRole("button", { name: new RegExp("Route 1") }).click();
    await expect(page.getByRole("heading", { name: "Traveling to " + first.sea.options[0].name, exact: true })).toBeVisible();
    const outward = await state(own);
    expect(outward.energy).toBe(95);
    expect(outward.sea.journey!.target_step).toBe(2);
    due(own);
    await page.reload();
    await expect(page.getByRole("heading", { name: first.sea.options[0].name, exact: true })).toBeVisible();
    await expect(page.locator(".o-sea-location").getByText("Sea distance 2", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Return to The Harbor", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Traveling to The Harbor", exact: true })).toBeVisible();
    const returning = await state(own);
    expect(Date.parse(returning.sea.journey!.arrives_at) - Date.parse(returning.sea.journey!.started_at)).toBe(120_000);
    expect(returning.energy).toBe(95);
    await page.screenshot({ path: ".local/sea-return-mobile.png", fullPage: true });
    await other.close();
    await page.getByRole("button", { name: "Log out", exact: true }).filter({ visible: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    due(own, 5);
    await watching.reload();
    await expect(watching.getByRole("link", { name: "Attack", exact: true })).toBeVisible({ timeout: 20_000 });
    await watching.goto("/harbor");
    // The roster is paged; its underlying projection must include the offline captain.
    const listed = await observer.api.from("harbor_players").select("character_id").eq("character_id", own.id);
    expect(listed.data).toEqual([{ character_id: own.id }]);
    expect(testSql("select location from public.characters where id='" + own.id + "';").trim()).toBe("traveling");
    await page.setViewportSize({ width: 1280, height: 1000 });
    await loginTestAccount(page, own);
    await expect(page.getByRole("button", { name: "Set sail", exact: true })).toBeEnabled();
    const home = await state(own);
    expect(home.sea.state).toBe("in_harbor");
    expect(home.sea.step).toBe(0);
    expect(home.energy_next_at).not.toBeNull();
    expect(errors).toEqual([]);
  } finally { await observerContext.close(); }
});

test("profiles show offline arrival records and retain the maximum after returning home", async ({ page }) => {
  const own = await captain(), observer = await captain();
  await loginTestAccount(page, observer);
  await page.goto("/characters/" + own.id);
  await expect(page.getByRole("status", { name: "Max sea distance", exact: true })).toHaveText("0");
  let snapshot = await state(own);
  expect((await own.api.rpc("depart_harbor", { expected_version: snapshot.sea.version, request_id: crypto.randomUUID() })).error).toBeNull();
  await page.reload();
  await expect(page.getByRole("status", { name: "Max sea distance", exact: true })).toHaveText("0");
  // No owner browser or state read settles this arrival.
  due(own, 3);
  await page.reload();
  await expect(page.getByRole("status", { name: "Max sea distance", exact: true })).toHaveText("1", { timeout: 15_000 });
  expect(testSql("select max_sea_distance from public.characters where id='" + own.id + "';").trim()).toBe("0");
  snapshot = await state(own);
  expect((await own.api.rpc("choose_sea_route", {
    expected_version: snapshot.sea.version, option_id: snapshot.sea.options[0].id, request_id: crypto.randomUUID(),
  })).error).toBeNull();
  await page.reload();
  await expect(page.getByRole("status", { name: "Max sea distance", exact: true })).toHaveText("1");
  due(own, 3);
  await page.reload();
  await expect(page.getByRole("status", { name: "Max sea distance", exact: true })).toHaveText("2", { timeout: 15_000 });
  snapshot = await state(own);
  expect((await own.api.rpc("return_to_harbor", { expected_version: snapshot.sea.version, request_id: crypto.randomUUID() })).error).toBeNull();
  due(own);
  await state(own);
  await page.reload();
  await expect(page.getByRole("status", { name: "Max sea distance", exact: true })).toHaveText("2");
  await page.getByRole("button", { name: "Log out", exact: true }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await loginTestAccount(page, own);
  await page.goto("/characters/" + own.id);
  await expect(page.getByRole("status", { name: "Max sea distance", exact: true })).toHaveText("2");
  for (const width of [1280, 375, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(page.getByRole("status", { name: "Max sea distance", exact: true })).toHaveText("2");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width !== 320) await page.screenshot({ path: ".local/sea-distance-profile-" + width + ".png", fullPage: true });
  }
});

test("concurrent departures and routes are atomic, and neither combat participant can depart", async () => {
  const own = await captain(), opponent = await captain();
  let snapshot = await state(own);
  const requestId = crypto.randomUUID();
  const departures = await Promise.all([0, 1].map(() => own.api.rpc("depart_harbor", {
    expected_version: snapshot.sea.version, request_id: requestId,
  })));
  expect(departures.every(result => !result.error)).toBe(true);
  expect(departures[0].data).toEqual(departures[1].data);
  expect((await state(own)).energy).toBe(95);
  due(own); snapshot = await state(own);
  const routes = await Promise.all(snapshot.sea.options.map(option => own.api.rpc("choose_sea_route", {
    expected_version: snapshot.sea.version, option_id: option.id, request_id: crypto.randomUUID(),
  })));
  expect(routes.filter(r => !r.error)).toHaveLength(1);
  expect(routes.find(r => r.error)?.error?.message).toBe("STALE_VOYAGE");
  expect((await state(own)).sea.journey!.target_step).toBe(2);
  due(own); snapshot = await state(own);
  const mixed = await Promise.all([
    own.api.rpc("choose_sea_route", { expected_version: snapshot.sea.version, option_id: snapshot.sea.options[0].id, request_id: crypto.randomUUID() }),
    own.api.rpc("return_to_harbor", { expected_version: snapshot.sea.version, request_id: crypto.randomUUID() }),
  ]);
  expect(mixed.filter(r => !r.error)).toHaveLength(1);
  expect(mixed.find(r => r.error)?.error?.message).toBe("STALE_VOYAGE");
  due(own); snapshot = await state(own);
  if (snapshot.sea.state === "at_sea") {
    expect((await own.api.rpc("return_to_harbor", { expected_version: snapshot.sea.version, request_id: crypto.randomUUID() })).error).toBeNull();
    due(own); await state(own);
  }
  const combat = await opponent.api.rpc("start_combat", { target_id: own.id, request_id: crypto.randomUUID() });
  expect(combat.error).toBeNull();
  expect(combat.data).toHaveProperty("battle");
  const battle = combat.data && "battle" in combat.data ? combat.data.battle : null;
  expect(battle).not.toBeNull();
  for (const player of [own, opponent]) {
    const current = await state(player);
    expect((await player.api.rpc("depart_harbor", { expected_version: current.sea.version, request_id: crypto.randomUUID() })).error?.message).toBe("IN_COMBAT");
  }
  expect((await opponent.api.rpc("submit_combat_order", { battle_id: battle!.id, expected_round: 0, player_order: "retreat", request_id: crypto.randomUUID() })).error).toBeNull();
  testSql("update public.characters set protected_until=null where id in ('" + own.id + "','" + opponent.id + "');");
  // Real separate PostgREST transactions compete for the same character/combat locks.
  snapshot = await state(own);
  const departureId = crypto.randomUUID(), attackId = crypto.randomUUID();
  const race = await Promise.all([
    retryCombatLock(() => own.api.rpc("depart_harbor", { expected_version: snapshot.sea.version, request_id: departureId })),
    retryCombatLock(() => opponent.api.rpc("start_combat", { target_id: own.id, request_id: attackId })),
  ]);
  const after = await state(own);
  if (after.sea.state === "traveling") {
    expect(after.active_combat_id).toBeNull();
    expect(race[1].data).toEqual({ error: "TARGET_TRAVELING" });
  } else {
    expect(after.active_combat_id).not.toBeNull();
    expect(race[0].error?.message).toBe("IN_COMBAT");
  }
});

test("departure stays locked until the thirty-second ship job completes", async ({ page }) => {
  test.setTimeout(60_000);
  const own = await captain();
  testSql("update public.characters set energy=4,energy_updated_at=clock_timestamp()+interval '1 day' where id='" + own.id + "';");
  await loginTestAccount(page, own);
  await expect(page.getByRole("button", { name: "Set sail", exact: true })).toBeDisabled();
  await expect(page.getByText("You need 5 Energy to leave.", { exact: true })).toBeVisible();
  testSql("update public.characters set energy=100,energy_updated_at=clock_timestamp()+interval '1 day' where id='" + own.id + "';");
  testSql("insert into private.item_stacks(character_id,item_id,quantity) select '" + own.id + "',item_id,10 from (values('oak_planks'),('iron_nails')) m(item_id);");
  expect((await own.api.rpc("start_ship_upgrade", { stat: "attack", energy_amount: 5, expected_workshop_id: "ship_1", request_id: crypto.randomUUID() })).error).toBeNull();
  await page.reload();
  const before = await state(own);
  expect(Date.parse(before.training.ship_job!.finishes_at) - Date.parse(before.training.ship_job!.started_at)).toBe(30_000);
  await expect(page.getByRole("button", { name: "Set sail", exact: true })).toBeDisabled();
  await expect(page.getByText("Your ship upgrade must finish before you can leave.", { exact: true })).toBeVisible();
  expect((await own.api.rpc("depart_harbor", { expected_version: before.sea.version, request_id: crypto.randomUUID() })).error?.message).toBe("SHIP_WORK_ACTIVE");
  await expect(page.getByRole("button", { name: "Set sail", exact: true })).toBeEnabled({ timeout: 35_000 });
  const completed = await state(own);
  expect(completed.sea.state).toBe("in_harbor");
  expect(completed.ship_attack).toBe(12.012938);
  expect(completed.training.ship_job).toBeNull();
  expect(completed.training.progress.ship.xp).toBe(5);
  expect(completed.energy).toBe(95);
  await page.getByRole("button", { name: "Set sail", exact: true }).click();
  await expect(page).toHaveURL(/\/sea$/);
  expect((await state(own)).energy).toBe(90);
});
