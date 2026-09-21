import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createTestAccount, cleanupTestAccounts, loginTestAccount, testSql } from "../support/accounts";
import { inventoryFixtureSql } from "../../scripts/inventory-fixture.mjs";

type Captain = Awaited<ReturnType<typeof createTestAccount>>;
const accounts: Captain[] = [];
async function captain() {
  const account = await createTestAccount("defender-lock");
  accounts.push(account);
  return account;
}
async function state(own: Captain) {
  const result = await own.api.rpc("get_game_state");
  expect(result.error).toBeNull();
  return result.data!;
}
async function attack(own: Captain, target: Captain) {
  const args = { target_id: target.id, request_id: randomUUID() };
  let result = await own.api.rpc("start_combat", args);
  for (let i = 0; result.error?.code === "40001" && i < 3; i++) result = await own.api.rpc("start_combat", args);
  expect(result.error).toBeNull();
  if (!result.data || "error" in result.data) throw new Error("Expected an active battle.");
  return result.data.battle.id;
}
async function retreat(own: Captain, battleId: string) {
  const result = await own.api.rpc("submit_combat_order", {
    battle_id: battleId, expected_round: 0, player_order: "retreat", request_id: randomUUID(),
  });
  expect(result.error).toBeNull();
  expect(result.data).toHaveProperty("battle");
}
async function sail(own: Captain) {
  expect((await own.api.rpc("depart_harbor", { expected_version: (await state(own)).sea.version, request_id: randomUUID() })).error).toBeNull();
  testSql("update public.characters set travel_started_at=clock_timestamp()-interval '61 seconds',travel_arrives_at=clock_timestamp()-interval '1 second' where id='" + own.id + "'");
  await state(own);
  testSql("update public.characters set sea_step=18000,ship_defense=10000,ship_speed=10000 where id='" + own.id + "'");
}
test.afterEach(async () => { await cleanupTestAccounts(accounts.splice(0)); });

test("defender can browse but open forms stay locked until the last attacker leaves", async ({ page, context }) => {
  test.setTimeout(120_000);
  const own = await captain(), a = await captain(), b = await captain(), other = await captain();
  testSql(inventoryFixtureSql(own.id));
  testSql("update public.characters set gold_coins=10000,bank_gold_coins=10000 where id='" + own.id +
    "'; update private.character_training set xp=100000 where character_id='" + own.id + "'");
  await loginTestAccount(page, own);
  await page.goto("/inventory");
  const crew = await context.newPage();
  try {
    await crew.goto("/harbor/crew-training");
    const train = crew.getByRole("button", { name: "Train Attack for 5 Energy", exact: true });
    const buy = crew.getByRole("button", { name: "Buy for 250 Gold Coins", exact: true });
    await expect(train).toBeEnabled();
    await expect(buy).toBeEnabled();
    await page.getByRole("button", { name: "Trash Linen Bandages", exact: true }).click();
    const destroy = page.getByRole("dialog").getByRole("button", { name: "Destroy 1 item", exact: true });
    await expect(destroy).toBeEnabled();
    const battleId = await attack(a, own);
    expect(await attack(b, own)).toBe(battleId);
    await expect(destroy).toBeDisabled({ timeout: 20000 });
    await expect(train).toBeDisabled();
    await expect(buy).toBeDisabled();
    await expect(page).toHaveURL(/\/inventory$/);
    await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("navigation", { name: "Item categories" }).getByRole("link", { name: "Medical", exact: true }).click();
    await page.getByRole("button", { name: "Linen Bandages details", exact: true }).click();
    await expect(page.getByRole("region", { name: "Linen Bandages details", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Trash Linen Bandages", exact: true })).toBeDisabled();
    expect((await own.api.rpc("list_inventory", { category_id: "medical" })).data?.items[0].quantity).toBe(10);
    await page.reload();
    await expect(page.getByRole("button", { name: "Trash Linen Bandages", exact: true })).toBeDisabled();

    await page.goto("/harbor/bank");
    await expect(page.getByRole("button", { name: "Deposit", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Withdraw", exact: true })).toBeDisabled();
    await expect(page.getByLabel("Amount", { exact: true })).toHaveAttribute("readonly", "");
    await page.goto("/harbor/ship-upgrades");
    await expect(page.getByRole("button", { name: "Start work", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Buy for 250 Gold Coins", exact: true })).toBeDisabled();
    await page.goto("/characters/" + own.id);
    await expect(page.getByRole("button", { name: "Save orders", exact: true })).toBeDisabled();
    await expect(page.getByLabel("At sea", { exact: true })).toBeDisabled();
    await page.goto("/characters/" + other.id);
    await expect(page.getByRole("button", { name: "Attack", exact: true })).toBeDisabled();
    await page.goto("/harbor");
    const depart = page.getByRole("button", { name: "Set sail", exact: true });
    await expect(depart).toBeDisabled();
    await retreat(a, battleId);
    expect((await state(own)).active_combat_id).toBe(battleId);
    await expect(depart).toBeDisabled();
    await expect(train).toBeDisabled();
    await retreat(b, battleId);
    await expect(depart).toBeEnabled({ timeout: 20000 });
    await expect(train).toBeEnabled({ timeout: 20000 });
    await expect(buy).toBeEnabled();
    await train.click();
    await expect(crew.getByLabel("Attack stat", { exact: true })).toHaveText(/^1[12]\.01$/);
    await page.goto("/inventory");
    await expect(page.getByRole("button", { name: "Trash Linen Bandages", exact: true })).toBeEnabled();
    await page.goto("/characters/" + own.id);
    await expect(page.getByRole("button", { name: "Save orders", exact: true })).toBeEnabled();
    await page.goto("/harbor/bank");
    await page.getByLabel("Amount", { exact: true }).fill("1");
    await expect(page.getByRole("button", { name: "Deposit", exact: true })).toBeEnabled();
  } finally { await crew.close(); }
});

test("sea defender cannot sail or scout but can read saved sightings and profiles", async ({ page }) => {
  const own = await captain(), a = await captain();
  await loginTestAccount(page, own);
  await sail(own); await sail(a);
  for (const player of [own, a]) {
    expect((await player.api.rpc("scout_nearby_ships", {
      expected_version: (await state(player)).sea.version, request_id: randomUUID(),
    })).error).toBeNull();
  }
  await page.goto("/sea");
  const scout = page.getByRole("button", { name: "Scout nearby ships", exact: true });
  const home = page.getByRole("button", { name: "Return to The Harbor", exact: true });
  await expect(scout).toBeEnabled();
  await expect(home).toBeEnabled();
  const before = await state(own), battleId = await attack(a, own);
  await expect(home).toBeDisabled({ timeout: 20000 });
  await expect(scout).toBeDisabled();
  for (const route of await page.locator(".o-sea-route").all()) await expect(route).toBeDisabled();
  for (const response of [
    await own.api.rpc("return_to_harbor", { expected_version: before.sea.version, request_id: randomUUID() }),
    await own.api.rpc("choose_sea_route", { expected_version: before.sea.version, option_id: before.sea.options[0].id, request_id: randomUUID() }),
    await own.api.rpc("scout_nearby_ships", { expected_version: before.sea.version, request_id: randomUUID() }),
  ]) expect(response.error?.message).toBe("IN_COMBAT");
  expect((await state(own)).energy).toBe(before.energy);
  await page.getByRole("list", { name: "Spotted ships" }).getByRole("link", { name: a.name, exact: true }).click();
  await expect(page).toHaveURL(new RegExp("/characters/" + a.id + "$"));
  await expect(page.getByRole("button", { name: "Attack", exact: true })).toBeDisabled();
  await page.goto("/sea");
  await expect(home).toBeDisabled();
  await retreat(a, battleId);
  await expect(home).toBeEnabled({ timeout: 20000 });
  await expect(scout).toBeEnabled();
  expect((await state(own)).sea.state).toBe("at_sea");
});
