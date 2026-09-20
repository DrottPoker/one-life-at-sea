import { test, expect } from "@playwright/test";
import { createTestAccount, cleanupTestAccounts, loginTestAccount, testSql } from "../support/accounts";
import type { GameState } from "../../src/lib/game";

type Captain = Awaited<ReturnType<typeof createTestAccount>>;
const accounts: Captain[] = [];
async function captain() {
  const account = await createTestAccount("scouting");
  accounts.push(account);
  return account;
}
async function state(own: Captain): Promise<GameState> {
  const result = await own.api.rpc("get_game_state");
  expect(result.error).toBeNull();
  return result.data!;
}
async function sail(own: Captain) {
  const before = await state(own);
  expect((await own.api.rpc("depart_harbor", { expected_version: before.sea.version, request_id: crypto.randomUUID() })).error).toBeNull();
  testSql("update public.characters set travel_started_at=clock_timestamp()-interval '61 seconds',travel_arrives_at=clock_timestamp()-interval '1 second' where id='" + own.id + "';");
  await state(own);
  // Isolate the fixture's distance from other locally running development captains.
  testSql("update public.characters set sea_step=17000,ship_defense=10000,ship_speed=10000 where id='" + own.id + "';");
}
async function retryLock<T extends { error: { code: string } | null }>(call: () => PromiseLike<T>): Promise<T> {
  let result = await call();
  for (let i = 0; result.error?.code === "40001" && i < 3; i++) result = await call();
  return result;
}
test.afterEach(async () => { await cleanupTestAccounts(accounts.splice(0)); });

test("paid scouting persists, finds later arrivals only on a new search, and opens a sea battle", async ({ page }) => {
  const own = await captain(), target = await captain(), late = await captain(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await loginTestAccount(page, own);
  await sail(own); await sail(target);
  await page.goto("/characters/" + target.id);
  await expect(page.getByRole("button", { name: "Attack", exact: true })).toBeDisabled();
  await page.goto("/sea");
  const scouting = page.getByRole("region", { name: "Nearby ships", exact: true });
  await scouting.getByRole("button", { name: "Scout nearby ships", exact: true }).click();
  await expect(scouting.getByRole("link", { name: target.name, exact: true })).toBeVisible();
  expect((await state(own)).energy).toBe(90);
  await page.reload();
  await expect(scouting.getByRole("link", { name: target.name, exact: true })).toBeVisible();
  expect((await state(own)).energy).toBe(90);
  await sail(late);
  await page.reload();
  await expect(scouting.getByRole("link", { name: target.name, exact: true })).toBeVisible();
  await expect(scouting.getByRole("link", { name: late.name, exact: true })).toHaveCount(0);
  await scouting.getByRole("button", { name: "Scout nearby ships", exact: true }).click();
  await expect(scouting.getByRole("link", { name: late.name, exact: true })).toBeVisible();
  expect((await state(own)).energy).toBe(85);
  for (const width of [1280, 375, 320]) {
    await page.setViewportSize({ width, height: 1050 });
    await expect(scouting.getByRole("link", { name: target.name, exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width !== 320) await page.screenshot({ path: ".local/scouting-" + width + ".png", fullPage: true });
  }
  await scouting.getByRole("link", { name: target.name, exact: true }).click();
  await expect(page).toHaveURL(new RegExp("/characters/" + target.id + "$"));
  await page.getByRole("link", { name: "Attack", exact: true }).click();
  await expect(page).toHaveURL(new RegExp("/attack/" + target.id + "$"));
  await expect(page.getByRole("link", { name: "Back to At Sea", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start battle 10 Energy", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Fire cannons 1 salvo/ })).toBeVisible();
  expect((await state(own)).energy).toBe(75);
  await page.getByRole("button", { name: /^Retreat Take/ }).click();
  await expect(page).toHaveURL(/\/combatlog\/[0-9a-f-]+$/);
  await page.goto("/sea");
  await expect(scouting.getByRole("link", { name: target.name, exact: true })).toBeVisible();
  expect((await state(own)).sea.state).toBe("at_sea");

  const moving = await state(late);
  expect((await late.api.rpc("return_to_harbor", { expected_version: moving.sea.version, request_id: crypto.randomUUID() })).error).toBeNull();
  await scouting.getByRole("link", { name: late.name, exact: true }).click();
  await expect(page.getByRole("button", { name: "Attack", exact: true })).toBeDisabled();
  await page.goto("/sea");
  testSql("update public.characters set energy=4 where id='" + own.id + "';");
  await page.reload();
  await expect(scouting.getByRole("button", { name: "Scout nearby ships", exact: true })).toBeDisabled();
  await expect(scouting.getByText("You need 5 Energy to scout.", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("concurrent scouting retries charge once and target departure is atomic with sea attack", async () => {
  const own = await captain(), target = await captain();
  await sail(own); await sail(target);
  const current = await state(own), requestId = crypto.randomUUID();
  const requests = await Promise.all([0, 1].map(() => own.api.rpc("scout_nearby_ships", {
    expected_version: current.sea.version, request_id: requestId,
  })));
  expect(requests.every(result => !result.error)).toBe(true);
  expect(requests[0].data).toEqual(requests[1].data);
  expect((await state(own)).energy).toBe(90);
  const targetState = await state(target), attackId = crypto.randomUUID(), departureId = crypto.randomUUID();
  const [attack, departure] = await Promise.all([
    retryLock(() => own.api.rpc("start_combat", { target_id: target.id, request_id: attackId })),
    retryLock(() => target.api.rpc("return_to_harbor", { expected_version: targetState.sea.version, request_id: departureId })),
  ]);
  expect(attack.error).toBeNull();
  const after = await state(target);
  if (after.sea.state === "traveling") {
    expect(departure.error).toBeNull();
    expect(attack.data).toEqual({ error: "TARGET_TRAVELING" });
    expect(after.active_combat_id).toBeNull();
    expect((await state(own)).energy).toBe(90);
  } else {
    expect(departure.error?.message).toBe("IN_COMBAT");
    expect(attack.data).toHaveProperty("battle");
    expect(after.active_combat_id).not.toBeNull();
    expect((await state(own)).energy).toBe(80);
  }
});

test("simultaneous scouts by different captains do not lock one another", async () => {
  const a = await captain(), b = await captain();
  await sail(a); await sail(b);
  const av = (await state(a)).sea.version, bv = (await state(b)).sea.version;
  for (let round = 0; round < 5; round++) {
    const results = await Promise.all([
      a.api.rpc("scout_nearby_ships", { expected_version: av, request_id: crypto.randomUUID() }),
      b.api.rpc("scout_nearby_ships", { expected_version: bv, request_id: crypto.randomUUID() }),
    ]);
    expect(results.map(result => result.error)).toEqual([null, null]);
  }
  expect((await state(a)).energy).toBe(70);
  expect((await state(b)).energy).toBe(70);
});
