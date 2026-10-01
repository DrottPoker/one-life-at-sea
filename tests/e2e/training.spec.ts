import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { shipTrainingStatGain, crewTrainingStatGain } from "../../src/lib/training";
import { formatStat, formatStatGain } from "../../src/lib/format";
import { formatItemCount } from "../../src/lib/inventory";
import { createTestAccount, createTestClient as client, cleanupTestAccounts, loginTestAccount as login, testSql } from "../support/accounts";
import { seedShipMaterials } from "../support/inventory";
import { isUuid } from "../../src/lib/validation";

const accounts: Awaited<ReturnType<typeof createTestAccount>>[] = [];
test.afterEach(async () => { await cleanupTestAccounts(accounts.splice(0)); });
function fixture(id: string, statement: string) {
  if (!isUuid(id)) throw new Error("Invalid fixture ID.");
  testSql(statement.replaceAll(":captain", "'" + id + "'"));
}
async function account() {
  const own = await createTestAccount("training");
  accounts.push(own);
  seedShipMaterials(own.id);
  return own;
}

test("crew XP, carried-gold purchases, two tabs, login and responsive layout", async ({ page, context }) => {
  test.setTimeout(120_000);
  const own = await account(), errors: string[] = [];
  page.on("pageerror", e => errors.push(e.name));
  fixture(own.id, "update public.characters set bank_gold_coins=1000 where id=:captain;");
  await login(page, own);
  await page.goto("/harbor/crew-training");
  await expect(page.getByText("5 Energy per drill", { exact: true })).toHaveCount(4);
  await expect(page.getByRole("region", { name: "Crew progression", exact: true }).getByRole("listitem")).toHaveCount(10);
  await expect(page.getByRole("spinbutton")).toHaveCount(0);
  for (const stat of ["Attack", "Defense", "Speed", "Accuracy"]) {
    const card = page.getByRole("region", { name: stat + " training", exact: true });
    const train = card.getByRole("button", { name: "Train " + stat + " for 5 Energy", exact: true });
    await expect(train).toBeEnabled();
    await expect(train).toHaveText("Train " + stat);
    await expect(train.locator("img, svg")).toHaveCount(0);
    await expect(card.getByRole("status", { name: stat + " training result", exact: true })).toBeEmpty();
    await expect(card.getByText("5 Energy per drill", { exact: true })).toBeVisible();
  }
  await expect(page.getByRole("main")).not.toContainText("Gain per drill");
  await expect.poll(() => page.locator(".o-training-page img").evaluateAll(images =>
    images.every(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0))).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.screenshot({ path: ".local/crew-training-ready-desktop.png", fullPage: true });
  const other = await context.newPage();
  await other.goto("/harbor/crew-training");
  for (const [index, stat] of ["Attack", "Defense", "Speed", "Accuracy"].entries()) {
    await page.getByRole("button", { name: "Train " + stat + " for 5 Energy", exact: true }).click();
    const normal = crewTrainingStatGain(10, 1, 5, -index * 2.5);
    const values = [formatStat(10 + normal), formatStat(10 + normal * 2)].map(value => value.replaceAll(".", "\\."));
    await expect(page.getByLabel(stat + " stat", { exact: true })).toHaveText(new RegExp("^(?:" + values.join("|") + ")$"));
    await expect(page.getByRole("progressbar", { name: "Energy", exact: true })).toHaveAttribute("aria-valuenow", String(95 - index * 5));
    const confirmed = (await own.api.rpc("get_game_state")).data!;
    const gained = Math.round((confirmed[("crew_" + stat.toLowerCase()) as "crew_attack"] - 10) * 1e6) / 1e6;
    const card = page.getByRole("region", { name: stat + " training", exact: true });
    await expect(card.getByLabel(stat + " gained", { exact: true })).toHaveText("+" + formatStatGain(gained) + " " + stat);
    await expect(card.locator(".o-training-feedback")).toHaveCount(0);
    await expect(other.getByLabel(stat + " gained", { exact: true })).toHaveCount(0);
  }
  await page.screenshot({ path: ".local/crew-training-results-desktop.png", fullPage: true });
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
  await expect(page.getByRole("listitem", { name: "Harbor Exercises, active", exact: true })).toBeVisible();
  await expect(other.getByRole("listitem", { name: "Harbor Exercises, active", exact: true })).toBeVisible();
  await expect(page.getByLabel("Gold Coins on character", { exact: true })).toHaveText("0");
  expect((await own.api.rpc("get_game_state")).data!.bank_gold_coins).toBe(750);
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
  await expect(page.getByRole("listitem", { name: "Harbor Exercises, active", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Train Attack for 5 Energy", exact: true })).toBeDisabled();
  fixture(own.id, "update public.characters set energy=4,energy_updated_at=date_bin(interval '5 minutes',clock_timestamp(),'1970-01-01Z')-interval '1 second' where id=:captain;");
  await page.reload();
  await expect(page.getByRole("button", { name: "Train Attack for 5 Energy", exact: true })).toBeEnabled({ timeout: 15000 });
  const beforeState = (await own.api.rpc("get_game_state")).data!;
  const before = beforeState.crew_attack;
  await page.getByRole("button", { name: "Train Attack for 5 Energy", exact: true }).click();
  const normalGain = crewTrainingStatGain(before, 1.15, 5, beforeState.crew_morale);
  await expect.poll(async () => [1, 2].map(multiplier => formatStat(Math.round((before + normalGain * multiplier) * 1e6) / 1e6))
    .includes(await page.getByLabel("Attack stat", { exact: true }).innerText())).toBe(true);
  expect(errors).toEqual([]);
});

test("variable ship jobs complete automatically, preserve work after login and update another tab", async ({ page, context }) => {
  test.setTimeout(120_000);
  const own = await account();
  fixture(own.id, "delete from private.item_stacks where character_id=:captain and item_id='iron_nails';");
  await login(page, own);
  await page.goto("/harbor/ship-upgrades");
  await expect(page.getByRole("button", { name: "Start work", exact: true })).toBeDisabled();
  await expect(page.getByText("You need the required materials in your inventory.", { exact: true })).toBeVisible();
  seedShipMaterials(own.id);
  await expect(page.getByRole("button", { name: "Start work", exact: true })).toBeEnabled();
  await page.screenshot({ path: ".local/ship-upgrade-materials-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 375, height: 1000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: ".local/ship-upgrade-materials-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 1000 });
  const other = await context.newPage();
  await other.goto("/harbor/ship-upgrades");
  let attack = 10, xp = 0, energy = 100, stock = 1000;
  for (const cost of [5, 26, 50]) {
    const gain = shipTrainingStatGain(attack, 1, cost);
    await expect(page.getByRole("main")).not.toContainText(/\bXP\b|earned|more XP required/);
    const slider = page.getByRole("slider", { name: "Work size", exact: true });
    await slider.focus();
    await slider.press("Home");
    for (let amount = 5; amount < cost; amount++) await slider.press("ArrowRight");
    const materials = page.locator(".o-ship-materials");
    await expect(materials.getByText(`${Math.ceil(cost / 5)} required · ${formatItemCount(stock)} owned`, { exact: true })).toHaveCount(2);
    await page.getByRole("button", { name: "Start work", exact: true }).click();
    energy -= cost;
    stock -= Math.ceil(cost / 5);
    await expect.poll(async () => (await own.api.rpc("get_game_state")).data!.training.ship_materials.map((item: { owned: number }) => item.owned)).toEqual([stock, stock]);
    await expect(page.getByRole("region", { name: "Ship work in progress" })).toBeVisible();
    await expect(page.getByLabel("Attack stat", { exact: true })).toHaveText(formatStat(attack));
    await expect(page.getByRole("progressbar", { name: "Energy", exact: true })).toHaveAttribute("aria-valuenow", String(energy));
    await expect(other.getByRole("region", { name: "Ship work in progress" })).toBeVisible();
    if (cost === 5) {
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
    attack = Math.round((attack + gain) * 1e6) / 1e6; xp += cost;
    await expect(page.getByLabel("Attack stat", { exact: true })).toHaveText(formatStat(attack), { timeout: 15000 });
    await expect(page.getByRole("progressbar", { name: "Workshop progress", exact: true })).toHaveAttribute("value", String(xp));
    await expect(other.getByLabel("Attack stat", { exact: true })).toHaveText(formatStat(attack), { timeout: 15000 });
    await expect(page.getByText("Last job completed: +" + formatStatGain(gain) + " Attack.", { exact: true })).toBeVisible();
  }
  await page.screenshot({ path: ".local/ship-work-completed-mobile.png", fullPage: true });
  await other.close();
  await page.getByRole("button", { name: "Log out", exact: true }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await login(page, own);
  await page.goto("/harbor/ship-upgrades");
  await expect(page.getByLabel("Attack stat", { exact: true })).toHaveText(formatStat(attack));
});

test("concurrent drills, purchases and ship starts cannot overspend or duplicate rewards", async () => {
  const own = await account(), other = await account();
  // @ts-expect-error Intentionally attempt a forbidden direct write.
  expect((await own.api.from("characters").update({ energy: 100, crew_attack: 999 }).not("id", "is", null)).error?.code).toBe("42501");
  // @ts-expect-error Verify server rejection of an invalid stat.
  expect((await own.api.rpc("train_crew", { stat: "health", expected_tier_id: "crew_1", request_id: randomUUID() })).error?.code).toBe("22023");
  const results = await Promise.all(Array.from({ length: 25 }, () => own.api.rpc("train_crew", {
    stat: "attack", expected_tier_id: "crew_1", request_id: randomUUID(),
  })));
  const successful = results.filter(r => !r.error);
  expect(successful).toHaveLength(20);
  const ordered = successful.map(result => {
    if (result.data?.kind !== "crew") throw new Error("Expected a crew training receipt.");
    const { stat_before, normal_gain, morale_before } = result.data;
    if (stat_before === undefined || normal_gain === undefined || morale_before === undefined) throw new Error("Incomplete crew receipt.");
    return { ...result.data, stat_before, normal_gain, morale_before };
  }).sort((a, b) => a.stat_before - b.stat_before);
  let current = 10;
  for (const receipt of ordered) {
    expect(receipt.stat_before).toBe(current);
    expect(receipt.normal_gain).toBe(crewTrainingStatGain(current, 1, 5, receipt.morale_before));
    expect(receipt.stat_gain).toBe(receipt.normal_gain * (receipt.perfect ? 2 : 1));
    current = Math.round((current + receipt.stat_gain) * 1e6) / 1e6;
  }
  expect(results.filter(r => r.error?.message === "NOT_ENOUGH_ENERGY")).toHaveLength(5);
  expect((await own.api.rpc("get_game_state")).data!).toMatchObject({
    energy: 0, crew_attack: Math.round((10 + ordered.reduce((sum, receipt) => sum + receipt.stat_gain, 0)) * 1e6) / 1e6,
    training: { progress: { crew: { xp: 100, tier_id: "crew_1" }, ship: { xp: 0 } } },
  });
  fixture(own.id, "update public.characters set gold_coins=1000,energy=100,energy_updated_at=clock_timestamp()+interval '1 day',morale_updated_at=clock_timestamp()+interval '1 day' where id=:captain;");
  const request = randomUUID();
  const purchases = await Promise.all(Array.from({ length: 8 }, () => own.api.rpc("purchase_training_tier", {
    training_group: "crew", tier_id: "crew_2", request_id: request,
  })));
  expect(purchases.every(r => !r.error)).toBe(true);
  expect((await own.api.rpc("get_game_state")).data!.gold_coins).toBe(750);
  const crewId = randomUUID();
  const drills = await Promise.all(Array.from({ length: 8 }, () => own.api.rpc("train_crew", {
    stat: "speed", expected_tier_id: "crew_2", request_id: crewId,
  })));
  expect(drills.every(r => !r.error && JSON.stringify(r.data) === JSON.stringify(drills[0].data))).toBe(true);
  expect((await own.api.rpc("get_game_state")).data!.energy).toBe(95);
  const starts = await Promise.all(Array.from({ length: 8 }, () => own.api.rpc("start_ship_upgrade", {
    stat: "attack", energy_amount: 50, expected_workshop_id: "ship_1", request_id: randomUUID(),
  })));
  expect(starts.filter(r => !r.error)).toHaveLength(1);
  expect(starts.filter(r => r.error?.message === "SHIP_WORK_ACTIVE")).toHaveLength(7);
  const shipState = (await own.api.rpc("get_game_state")).data!;
  expect(shipState.energy).toBe(45);
  expect(shipState.training.ship_materials.map((item: { owned: number }) => item.owned)).toEqual([990, 990]);
  fixture(own.id, "update private.ship_upgrade_jobs set started_at=clock_timestamp()-interval '1 hour',finishes_at=clock_timestamp()-interval '1 second' where character_id=:captain and applied_at is null;");
  const reads = await Promise.all(Array.from({ length: 8 }, () => own.api.rpc("get_game_state")));
  expect(reads.every(r => !r.error && r.data!.ship_attack === 30.237736 && r.data!.training.progress.ship.xp === 50)).toBe(true);
  expect((await other.api.rpc("get_game_state")).data!).toMatchObject({ energy: 100, crew_attack: 10, ship_attack: 10 });
  expect((await client().rpc("train_crew", { stat: "attack", expected_tier_id: "crew_1", request_id: randomUUID() })).error?.code).toBe("42501");
  // @ts-expect-error Verify the removed RPC is unavailable.
  expect((await own.api.rpc("train_stat", { training_group: "ship", stat: "attack" })).error).not.toBeNull();
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
  const card = page.getByRole("region", { name: "Attack training", exact: true });
  await expect(card.getByRole("button", { name: "Retry action", exact: true })).toBeVisible();
  await expect(card.getByRole("status", { name: "Attack training result", exact: true })).toContainText("could not be confirmed");
  await expect(card.getByLabel("Attack gained", { exact: true })).toHaveCount(0);
  const before = (await own.api.rpc("get_game_state")).data!;
  expect(before.energy).toBe(95);
  expect(before.training.progress.crew.xp).toBe(5);
  await page.getByRole("button", { name: "Retry action", exact: true }).click();
  await expect(card.getByLabel("Attack gained", { exact: true })).toHaveText("+" + formatStatGain(Math.round((before.crew_attack - 10) * 1e6) / 1e6) + " Attack");
  await expect(card.getByRole("button", { name: "Retry action", exact: true })).toHaveCount(0);
  const after = (await own.api.rpc("get_game_state")).data!;
  expect(after.energy).toBe(95);
  expect(after.crew_attack).toBe(before.crew_attack);
  expect(after.training.progress.crew.xp).toBe(5);
});

test("ship slider tracks available Energy and awards fractional stats", async ({ page }) => {
  test.setTimeout(90_000);
  const own = await account(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  fixture(own.id, "update public.characters set ship_defense=10000.625,ship_speed=10000000000.625,energy=0,energy_updated_at=clock_timestamp()+interval '1 day',morale_updated_at=clock_timestamp()+interval '1 day' where id=:captain;");
  await login(page, own);
  await page.goto("/harbor/ship-upgrades");
  const slider = page.getByRole("slider", { name: "Work size", exact: true });
  const start = page.getByRole("button", { name: "Start work", exact: true });
  await expect(slider).toHaveAttribute("min", "5");
  await expect(page.getByLabel("Defense stat", { exact: true })).toHaveText("10,001");
  await expect(page.getByLabel("Speed stat", { exact: true })).toHaveText("10,000,000,001");
  await expect(slider).toBeDisabled();
  await expect(start).toBeDisabled();
  for (const energy of [4, 5, 37]) {
    fixture(own.id, "update public.characters set energy=" + energy + ",energy_updated_at=clock_timestamp()+interval '1 day',morale_updated_at=clock_timestamp()+interval '1 day' where id=:captain; select private.notify_training(:captain);");
    await expect(page.getByText(energy + " Energy available", { exact: true })).toBeVisible();
    if (energy < 5) {
      await expect(slider).toBeDisabled();
      await expect(start).toBeDisabled();
    } else {
      await expect(slider).toBeEnabled();
      await expect(start).toBeEnabled();
      await expect(slider).toHaveAttribute("max", String(energy));
      await slider.press("End");
      await expect(slider).toHaveValue(String(energy));
    }
  }
  fixture(own.id, "update public.characters set energy=7,energy_updated_at=clock_timestamp()+interval '1 day',morale_updated_at=clock_timestamp()+interval '1 day' where id=:captain; select private.notify_training(:captain);");
  await expect(slider).toHaveAttribute("max", "7");
  await expect(slider).toHaveValue("7");
  await slider.press("ArrowLeft");
  await expect(slider).toHaveValue("6");
  await expect(page.getByText("+2.42 Attack", { exact: true })).toBeVisible();
  await page.getByRole("radio", { name: "Defense", exact: true }).check();
  await expect(page.getByText("+" + formatStatGain(shipTrainingStatGain(10000.625, 1, 6)) + " Defense", { exact: true })).toBeVisible();
  await page.getByRole("radio", { name: "Speed", exact: true }).check();
  const largeGain = shipTrainingStatGain(10000000000.625, 1, 6);
  expect(largeGain).toBeGreaterThan(10000);
  await expect(page.getByText("+" + formatStatGain(largeGain) + " Speed", { exact: true })).toBeVisible();
  await page.getByRole("radio", { name: "Attack", exact: true }).check();
  await expect(page.getByText("+2.42 Attack", { exact: true })).toBeVisible();
  await expect(page.getByText("6 Energy · 36 seconds", { exact: true })).toBeVisible();
  for (const width of [1280, 375, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width !== 320) await page.screenshot({ path: ".local/ship-slider-" + width + ".png", fullPage: true });
  }
  await start.click();
  await expect(page.getByRole("region", { name: "Ship work in progress" })).toContainText("+2.42 Attack");
  const state = (await own.api.rpc("get_game_state")).data!;
  expect(state.energy).toBe(1);
  expect(state.ship_attack).toBe(10);
  expect(state.ship_defense).toBe(10000.625);
  expect(state.ship_speed).toBe(10000000000.625);
  expect(state.training.ship_job).toMatchObject({ energy_cost: 6, stat_gain: 2.415814, xp_gain: 6 });
  expect(Date.parse(state.training.ship_job!.finishes_at) - Date.parse(state.training.ship_job!.started_at)).toBe(36_000);
  fixture(own.id, "update private.ship_upgrade_jobs set started_at=clock_timestamp()-interval '7 minutes',finishes_at=clock_timestamp()-interval '1 second' where character_id=:captain and applied_at is null;");
  await page.reload();
  await expect(page.getByLabel("Attack stat", { exact: true })).toHaveText("12.42");
  await expect(slider).toBeDisabled();
  await expect(start).toBeDisabled();
  expect(errors).toEqual([]);
});
