import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createTestAccount, cleanupTestAccounts, loginTestAccount, testSql } from "../support/accounts";
import { inventoryFixtureSql } from "../../scripts/inventory-fixture.mjs";

type Captain = Awaited<ReturnType<typeof createTestAccount>>;
const accounts: Captain[] = [];
async function captain(seed = true) {
  const own = await createTestAccount("economy-audit");
  accounts.push(own);
  if (seed) testSql(inventoryFixtureSql(own.id));
  return own;
}
test.afterEach(async () => {
  if (accounts.length) {
    const ids = accounts.map(own => "'" + own.id + "'").join(",");
    testSql("delete from private.market_sales where buyer_id in(" + ids + ") or seller_id in(" + ids + ");");
  }
  await cleanupTestAccounts(accounts.splice(0));
});
async function item(own: Captain, itemId: string) {
  const inventory = await own.api.rpc("list_inventory");
  expect(inventory.error).toBeNull();
  return inventory.data!.items.find(item => item.item_id === itemId)!;
}
async function offer(own: Captain, itemId: string, quantity: number, price: number) {
  const entry = await item(own, itemId);
  const response = await own.api.rpc("create_market_listings", { entries: [{
    entry_id: entry.id, entry_type: entry.entry_type, quantity, unit_price: price,
  }], request_id: randomUUID() });
  expect(response.error).toBeNull();
  if (response.data?.action !== "create") throw Error("Missing listing receipt");
  return response.data.listings[0];
}
async function loseNextActionResponse(page: Page, path: string) {
  let lost = false;
  await page.route("**" + path, async route => {
    if (!lost && route.request().method() === "POST" && route.request().headers()["next-action"]) {
      lost = true;
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      await route.abort("failed");
    } else await route.continue();
  });
}
async function confirmAfterReload(page: Page, own: Captain) {
  await page.reload();
  const recovery = page.getByRole("region", { name: "Unconfirmed action", exact: true });
  await expect(recovery).toBeVisible();
  await recovery.getByRole("button", { name: "Check saved action", exact: true }).click();
  await expect(recovery).toHaveCount(0);
  expect(await page.evaluate(id => localStorage.getItem("one-life-at-sea:economy-request:" + id), own.id)).toBeNull();
}
async function retryLock<T extends { error: { code: string } | null }>(operation: () => PromiseLike<T>) {
  let response = await operation();
  for (let n = 0; ["40001", "40P01"].includes(response.error?.code ?? "") && n < 5; n++) response = await operation();
  return response;
}

test("a committed purchase survives reload and can be confirmed from another tab", async ({ page, context }) => {
  const seller = await captain(), buyer = await captain(false);
  testSql("update public.characters set gold_coins=1000 where id='" + buyer.id + "';");
  const listing = await offer(seller, "linen_bandages", 5, 20);
  await loginTestAccount(page, buyer);
  await page.goto("/harbor/marketplace");
  const other = await context.newPage();
  await other.goto("/harbor/bank");
  await other.getByLabel("Amount", { exact: true }).fill("10");
  const showOffers = page.getByRole("button", { name: "View Linen Bandages listings", exact: true });
  await showOffers.focus();
  await showOffers.click();
  const row = page.locator('[data-listing-id="' + listing.id + '"]');
  await row.getByRole("textbox").fill("2");
  await loseNextActionResponse(page, "/harbor/marketplace");
  await row.getByRole("button", { name: "Buy Linen Bandages from " + seller.name, exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry trade", exact: true })).toBeVisible();
  await expect(other.getByRole("region", { name: "Unconfirmed action", exact: true })).toBeVisible();
  await expect(other.getByLabel("Amount", { exact: true })).not.toBeEditable();
  await expect(other.getByRole("button", { name: "Deposit", exact: true })).toBeDisabled();
  await page.reload();
  await other.getByRole("button", { name: "Check saved action", exact: true }).click();
  await expect(other.getByText("Bought 2 for 40 Gold Coins.", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Unconfirmed action", exact: true })).toHaveCount(0);
  expect((await buyer.api.rpc("get_game_state")).data!.gold_coins).toBe(960);
  expect((await item(buyer, "linen_bandages")).quantity).toBe(2);
  expect(testSql("select count(*) from private.market_sales where listing_id='" + listing.id + "';").trim()).toBe("1");
  await other.close();
});

test("a bank transfer lost after commit survives a full reload", async ({ page }) => {
  const own = await captain(false);
  testSql("update public.characters set gold_coins=100 where id='" + own.id + "';");
  await loginTestAccount(page, own);
  await page.goto("/harbor/bank");
  await loseNextActionResponse(page, "/harbor/bank");
  await page.getByLabel("Amount", { exact: true }).fill("40");
  await page.getByRole("button", { name: "Deposit", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry transfer", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 375, height: 1000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: ".local/economy-recovery-mobile.png", fullPage: true });
  await confirmAfterReload(page, own);
  await expect(page.getByText("Deposited 40 Gold Coins.", { exact: true })).toBeVisible();
  expect((await own.api.rpc("get_game_state")).data).toMatchObject({ gold_coins: 60, bank_gold_coins: 40 });
});

test("destroying items cannot repeat when an uncertain result is checked after navigation", async ({ page }) => {
  const own = await captain();
  await loginTestAccount(page, own);
  await page.goto("/inventory");
  await loseNextActionResponse(page, "/inventory");
  await page.getByRole("button", { name: "Trash Linen Bandages", exact: true }).click();
  await page.getByLabel("Quantity to destroy", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Destroy 2 items", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry trash action", exact: true })).toBeVisible();
  await page.goto("/harbor");
  await confirmAfterReload(page, own);
  await expect(page.getByText("Destroyed 2 × Linen Bandages.", { exact: true })).toBeVisible();
  expect((await item(own, "linen_bandages")).quantity).toBe(8);
});

test("fixture reruns cannot duplicate equipment in escrow or after sale", async () => {
  const seller = await captain(), buyer = await captain(false);
  testSql("update public.characters set gold_coins=1000 where id='" + buyer.id + "';");
  const equipment = await item(seller, "cutlass");
  const listing = await offer(seller, "cutlass", 1, 100);
  testSql(inventoryFixtureSql(seller.id));
  expect(testSql("select count(*) from private.item_instances where id='" + equipment.id + "';").trim()).toBe("0");
  const bought = await buyer.api.rpc("buy_market_listing", { listing_id: listing.id, quantity: 1, expected_unit_price: 100, request_id: randomUUID() });
  expect(bought.error).toBeNull();
  testSql(inventoryFixtureSql(seller.id));
  expect(testSql("select character_id from private.item_instances where id='" + equipment.id + "';").trim()).toBe(buyer.id);
  expect((await item(buyer, "cutlass")).stats).toEqual(equipment.stats);
});

test("mixed concurrent trades, bank transfers, cancellations and trash conserve items and money", async () => {
  test.setTimeout(120_000);
  const a = await captain(), b = await captain();
  const ids = "'" + a.id + "','" + b.id + "'";
  testSql("update public.characters set gold_coins=50000,bank_gold_coins=2000 where id in(" + ids + ");" +
    "update private.item_stacks set quantity=200 where item_id='linen_bandages' and character_id in(" + ids + ");");
  for (let round = 0; round < 8; round++) {
    const aListing = await offer(a, "linen_bandages", 5, 19), bListing = await offer(b, "linen_bandages", 5, 23);
    const operations: PromiseLike<{ error: { message: string } | null }>[] = [];
    for (const [buyer, listing] of [[a, bListing], [b, aListing]] as const) {
      for (let purchase = 0; purchase < 3; purchase++) {
        const request = { listing_id: listing.id, quantity: 1, expected_unit_price: listing.unit_price, request_id: randomUUID() };
        for (let copy = 0; copy < 2; copy++) operations.push(retryLock(() => buyer.api.rpc("buy_market_listing", request)));
      }
      for (const direction of ["deposit", "withdraw"] as const) {
        const request = { direction, amount: 37, request_id: randomUUID() };
        operations.push(retryLock(() => buyer.api.rpc("transfer_gold", request)));
      }
      const entry = await item(buyer, "linen_bandages");
      const trash = { entry_id: entry.id, entry_type: "stack" as const, quantity: 1, request_id: randomUUID() };
      operations.push(retryLock(() => buyer.api.rpc("trash_inventory_item", trash)));
    }
    const cancellations = [[a, aListing], [b, bListing]] as const;
    for (const [seller, listing] of cancellations) {
      const request = { listing_id: listing.id, request_id: randomUUID() };
      operations.push(retryLock(() => seller.api.rpc("cancel_market_listing", request)));
    }
    const responses = await Promise.all(operations);
    for (const response of responses) expect([null, "LISTING_UNAVAILABLE"]).toContain(response.error?.message ?? null);
    const totals = JSON.parse(testSql("select json_build_object(" +
      "'items',(select coalesce(sum(quantity),0) from private.item_stacks where item_id='linen_bandages' and character_id in(" + ids + "))+" +
      "(select coalesce(sum(quantity),0) from private.market_listings where item_id='linen_bandages' and seller_id in(" + ids + "))," +
      "'money',(select sum(gold_coins::numeric+bank_gold_coins) from public.characters where id in(" + ids + "))+" +
      "(select coalesce(sum(fee),0) from private.market_sales where seller_id in(" + ids + ")))"));
    expect(totals).toEqual({ items: 400 - (round + 1) * 2, money: 104000 });
  }
});

test("listing versus destroying the same equipment commits exactly one outcome", async () => {
  const own = await captain(), equipment = await item(own, "cutlass");
  const listing = { entries: [{ entry_id: equipment.id, entry_type: "instance" as const, quantity: 1, unit_price: 100 }], request_id: randomUUID() };
  const trash = { entry_id: equipment.id, entry_type: "instance" as const, quantity: 1, request_id: randomUUID() };
  const results = await Promise.all([
    retryLock(() => own.api.rpc("create_market_listings", listing)),
    retryLock(() => own.api.rpc("trash_inventory_item", trash)),
  ]);
  expect(results.filter(response => !response.error)).toHaveLength(1);
  expect(results.find(response => response.error)?.error?.message).toBe("ITEM_NOT_FOUND");
  expect(testSql("select count(*) from private.item_instances where id='" + equipment.id + "';").trim()).toBe("0");
  expect(testSql("select count(*) from private.market_listings where original_entry_id='" + equipment.id + "' and quantity>0;").trim())
    .toBe(results[0].error ? "0" : "1");
});

test("a tier purchase retains its original tier and price after a lost response and reload", async ({ page }) => {
  const own = await captain(false);
  testSql("update public.characters set gold_coins=1000 where id='" + own.id + "';" +
    "update private.character_training set xp=100 where character_id='" + own.id + "' and training_group='crew';");
  await loginTestAccount(page, own);
  await page.goto("/harbor/crew-training");
  await loseNextActionResponse(page, "/harbor/crew-training");
  await page.getByRole("button", { name: "Buy for 250 Gold Coins", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry action", exact: true })).toBeVisible();
  await confirmAfterReload(page, own);
  await expect(page.getByText("Harbor Exercises purchased for 250 Gold Coins.", { exact: true })).toBeVisible();
  const state = (await own.api.rpc("get_game_state")).data!;
  expect(state.gold_coins).toBe(750);
  expect(state.training.progress.crew.tier_id).toBe("crew_2");
});

for (const action of ["create", "cancel"] as const) {
  test("an uncertain listing " + action + " survives reload without repeating item movement", async ({ page }) => {
    const own = await captain();
    if (action === "cancel") await offer(own, "linen_bandages", 2, 19);
    await loginTestAccount(page, own);
    const path = "/harbor/marketplace/" + (action === "create" ? "add" : "listings");
    await page.goto(path);
    await loseNextActionResponse(page, path);
    if (action === "create") {
      await page.getByLabel("Quantity of Linen Bandages", { exact: true }).fill("2");
      await page.getByLabel("Unit price for Linen Bandages", { exact: true }).fill("19");
      await page.getByRole("button", { name: "Add to Market", exact: true }).click();
    } else await page.getByRole("button", { name: "Cancel listing", exact: true }).click();
    await expect(page.getByRole("button", { name: "Retry trade", exact: true })).toBeVisible();
    await confirmAfterReload(page, own);
    expect((await item(own, "linen_bandages")).quantity).toBe(action === "create" ? 8 : 10);
    expect(testSql("select coalesce(sum(quantity),0) from private.market_listings where seller_id='" + own.id + "';").trim())
      .toBe(action === "create" ? "2" : "0");
  });
}
