import { test, expect, type Page } from "@playwright/test";
import { createTestAccount, cleanupTestAccounts, loginTestAccount, testSql } from "../support/accounts";
import { inventoryFixtureSql } from "../../scripts/inventory-fixture.mjs";
import type { SaleEntry } from "../../src/lib/marketplace";

type Captain = Awaited<ReturnType<typeof createTestAccount>>;
const accounts: Captain[] = [];
async function captain(seed = false) {
  const own = await createTestAccount("market");
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
async function inventory(own: Captain) {
  const response = await own.api.rpc("list_inventory");
  expect(response.error).toBeNull();
  return response.data!.items;
}
async function offer(own: Captain, itemId: string, quantity: number, price: number) {
  const item = (await inventory(own)).find(item => item.item_id === itemId)!;
  const response = await own.api.rpc("create_market_listings", { entries: [{
    entry_id: item.id, entry_type: item.entry_type, quantity, unit_price: price,
  }], request_id: crypto.randomUUID() });
  expect(response.error).toBeNull();
  if (response.data?.action !== "create") throw Error("Expected listing receipt");
  return response.data.listings[0];
}
async function openOffers(page: Page, name: string) {
  const button = page.getByRole("button", { name: "View " + name + " listings", exact: true });
  await button.focus();
  await button.click();
  return page.getByRole("region", { name: name + " listings", exact: true });
}
async function retryLock<T extends { error: { code: string } | null }>(operation: () => PromiseLike<T>) {
  let result = await operation();
  for (let attempt = 0; result.error?.code === "40001" && attempt < 3; attempt++) result = await operation();
  return result;
}

test("Torn-style grid, inventory details, batch listings, real purchases, fees and cancellation", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const seller = await captain(true), buyer = await captain(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  testSql("update public.characters set gold_coins=1000 where id='" + buyer.id + "';");
  await loginTestAccount(page, seller);
  await page.goto("/harbor/marketplace/add");
  const rows = page.getByRole("list", { name: "Sellable items", exact: true });
  const bandages = rows.getByRole("listitem").filter({ hasText: "Linen Bandages" });
  await bandages.getByLabel("Quantity of Linen Bandages", { exact: true }).fill("6");
  await bandages.getByLabel("Unit price for Linen Bandages", { exact: true }).fill("20");
  const cutlass = rows.getByRole("listitem").filter({ hasText: "Sailor's Cutlass" }).first();
  const instanceId = await cutlass.getAttribute("data-entry-id");
  await cutlass.getByLabel("Unit price for Sailor's Cutlass", { exact: true }).fill("101");
  await expect(page.getByText("You are adding", { exact: false })).toContainText("7 items");
  const compass = rows.getByRole("listitem").filter({ hasText: "Brass Compass" });
  await compass.getByLabel("Unit price for Brass Compass", { exact: true }).fill("invalid");
  await compass.getByLabel("Select Brass Compass", { exact: true }).uncheck();
  await page.getByRole("navigation", { name: "Market categories" }).getByRole("link", { name: "Medical", exact: true }).click();
  await expect(rows.getByRole("listitem")).toHaveCount(1);
  await expect(page.getByText("You are adding", { exact: false })).toContainText("7 items");
  await page.getByRole("navigation", { name: "Market categories" }).getByRole("link", { name: "All items", exact: true }).click();
  await expect(compass.getByLabel("Unit price for Brass Compass", { exact: true })).toHaveValue("invalid");
  await expect(compass.getByLabel("Select Brass Compass", { exact: true })).not.toBeChecked();
  for (const width of [1280, 375, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width !== 320) await page.screenshot({ path: ".local/market-add-" + width + ".jpg", fullPage: true, type: "jpeg", quality: 60 });
  }
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.getByRole("button", { name: "Add to Market", exact: true }).click();
  await expect(page.getByText("2 listings added.", { exact: true })).toBeVisible();
  expect((await inventory(seller)).find(item => item.item_id === "linen_bandages")?.quantity).toBe(4);
  expect((await inventory(seller)).some(item => item.id === instanceId)).toBe(false);
  await page.getByRole("navigation", { name: "Marketplace", exact: true }).getByRole("link", { name: "View Your Listings", exact: true }).click();
  await expect(page.getByRole("list", { name: "Your active listings" }).getByRole("listitem")).toHaveCount(2);

  const buyerContext = await browser.newContext(), shopping = await buyerContext.newPage();
  shopping.on("pageerror", error => errors.push(error.message));
  try {
    await loginTestAccount(shopping, buyer);
    await shopping.goto("/harbor/marketplace");
    await expect(shopping.getByRole("heading", { name: "Most Popular", exact: true })).toBeVisible();
    const card = shopping.locator('[data-item-id="linen_bandages"]');
    await expect(card.locator(".o-market-card-price")).toHaveText(/\d[\d,]*\s*\(\d[\d,]*\)/);
    await expect(card.getByText("sold /", { exact: false })).toHaveCount(0);
    const eye = card.getByRole("button", { name: "View Linen Bandages details", exact: true });
    await card.hover();
    await expect(eye).toBeVisible();
    await eye.click();
    await expect(shopping.getByRole("region", { name: "Linen Bandages details", exact: true })).toContainText("Clean linen");
    await shopping.getByRole("button", { name: "Close Linen Bandages details", exact: true }).click();
    const offers = await openOffers(shopping, "Linen Bandages");
    await expect(offers.getByRole("link", { name: seller.name, exact: true })).toBeVisible();
    for (const width of [1280, 375, 320]) {
      await shopping.setViewportSize({ width, height: 1000 });
      expect(await shopping.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (width !== 320) await shopping.screenshot({ path: ".local/market-buy-" + width + ".jpg", fullPage: true, type: "jpeg", quality: 60 });
    }
    await shopping.setViewportSize({ width: 1280, height: 1000 });
    await offers.getByLabel("Quantity from " + seller.name).fill("3");
    await offers.getByRole("button", { name: "Buy Linen Bandages from " + seller.name, exact: true }).click();
    await expect(shopping.getByText("Bought 3 for 60 Gold Coins.", { exact: true })).toBeVisible();
    expect((await buyer.api.rpc("get_game_state")).data!.gold_coins).toBe(940);
    expect((await seller.api.rpc("get_game_state")).data!.gold_coins).toBe(57);
    expect((await inventory(buyer)).find(item => item.item_id === "linen_bandages")?.quantity).toBe(3);
    const ownBandages = page.getByRole("listitem").filter({ hasText: "Linen Bandages" });
    await expect(ownBandages).toContainText("3 available");
    await ownBandages.getByRole("button", { name: "Cancel listing", exact: true }).click();
    await expect(page.getByText("3 returned to your inventory.", { exact: true })).toBeVisible();
    expect((await inventory(seller)).find(item => item.item_id === "linen_bandages")?.quantity).toBe(7);
    await expect(offers.getByRole("link", { name: seller.name, exact: true })).toHaveCount(0);
    await offers.getByRole("button", { name: "Close listings", exact: true }).click();
    const weaponOffers = await openOffers(shopping, "Sailor's Cutlass");
    await expect(weaponOffers).toContainText("Damage");
    await weaponOffers.getByRole("button", { name: "Buy Sailor's Cutlass from " + seller.name, exact: true }).click();
    await expect(shopping.getByText("Bought 1 for 101 Gold Coins.", { exact: true })).toBeVisible();
    expect((await inventory(buyer)).find(item => item.id === instanceId)?.stats).toBeTruthy();
    await expect(page.getByText("You have no active listings.", { exact: true })).toBeVisible();
    await shopping.reload();
    expect((await inventory(buyer)).find(item => item.id === instanceId)).toBeDefined();
    expect(errors).toEqual([]);
  } finally { await buyerContext.close(); }
});

test("concurrent buyers and cancellation cannot duplicate the last item or money", async () => {
  const seller = await captain(true), a = await captain(), b = await captain();
  testSql("update public.characters set gold_coins=1000 where id in('" + a.id + "','" + b.id + "');");
  const listing = await offer(seller, "cutlass", 1, 100);
  const responses = await Promise.all([a, b].map(own => retryLock(() => own.api.rpc("buy_market_listing", {
    listing_id: listing.id, quantity: 1, expected_unit_price: 100, request_id: crypto.randomUUID(),
  }))));
  expect(responses.filter(response => !response.error)).toHaveLength(1);
  expect(responses.filter(response => response.error?.message === "LISTING_UNAVAILABLE")).toHaveLength(1);
  expect((await seller.api.rpc("get_game_state")).data!.gold_coins).toBe(95);
  expect((await a.api.rpc("get_game_state")).data!.gold_coins + (await b.api.rpc("get_game_state")).data!.gold_coins).toBe(1900);
  const last = await offer(seller, "brass_compass", 1, 20);
  const [buy, cancel] = await Promise.all([
    retryLock(() => a.api.rpc("buy_market_listing", { listing_id: last.id, quantity: 1, expected_unit_price: 20, request_id: crypto.randomUUID() })),
    retryLock(() => seller.api.rpc("cancel_market_listing", { listing_id: last.id, request_id: crypto.randomUUID() })),
  ]);
  expect(Number(!buy.error) + Number(!cancel.error)).toBe(1);
  const remaining = (await Promise.all([seller, a, b].map(inventory))).flat().filter(item => item.item_id === "brass_compass").reduce((sum, item) => sum + item.quantity, 0);
  expect(remaining).toBe(1);

  const stack = (await inventory(seller)).find(item => item.item_id === "linen_bandages")!;
  const entries: SaleEntry[] = [{ entry_id: stack.id, entry_type: "stack", quantity: 3, unit_price: 10 }];
  const requestId = crypto.randomUUID();
  const creates = await Promise.all(Array.from({ length: 5 }, () => seller.api.rpc("create_market_listings", { entries, request_id: requestId })));
  expect(creates.every(result => !result.error)).toBe(true);
  expect(creates.every(result => JSON.stringify(result.data) === JSON.stringify(creates[0].data))).toBe(true);
  expect((await inventory(seller)).find(item => item.id === stack.id)?.quantity).toBe(7);
});

test("lost purchase response can be retried after the offer disappears without paying twice", async ({ page }) => {
  const seller = await captain(true), buyer = await captain();
  testSql("update public.characters set gold_coins=1000 where id='" + buyer.id + "';");
  await offer(seller, "brass_compass", 1, 50);
  await loginTestAccount(page, buyer);
  await page.goto("/harbor/marketplace");
  const offers = await openOffers(page, "Brass Compass");
  let dropped = false;
  await page.route("**/harbor/marketplace", async route => {
    if (!dropped && route.request().method() === "POST" && route.request().headers()["next-action"]) {
      dropped = true; await route.fetch(); await route.abort("failed");
    } else await route.continue();
  });
  await offers.getByRole("button", { name: "Buy Brass Compass from " + seller.name, exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry trade", exact: true })).toBeVisible();
  await expect(offers.getByRole("link", { name: seller.name, exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Retry trade", exact: true }).click();
  await expect(page.getByText("Bought 1 for 50 Gold Coins.", { exact: true })).toBeVisible();
  expect((await buyer.api.rpc("get_game_state")).data!.gold_coins).toBe(950);
  expect((await inventory(buyer)).find(item => item.item_id === "brass_compass")?.quantity).toBe(1);
});

test("offers expand by twenty, retain earlier rows, refresh in price order and recover a failed expansion", async ({ page }) => {
  const seller = await captain(true), buyer = await captain();
  testSql("update private.item_stacks set quantity=60 where character_id='" + seller.id + "' and item_id='oak_planks';");
  const listingIds = new Set<string>();
  let cheapestId = "";
  for (let price = 45; price > 0; price--) {
    const listing = await offer(seller, "oak_planks", 1, price);
    listingIds.add(listing.id);
    if (price === 1) cheapestId = listing.id;
  }
  await loginTestAccount(page, buyer);
  await page.goto("/harbor/marketplace?category=materials");
  await expect(page.getByRole("heading", { name: "Materials", exact: true })).toBeVisible();
  await expect(page.locator('.o-market-card[data-item-id="oak_planks"]')).toHaveCount(1);
  const offers = await openOffers(page, "Oak Planks");
  const marketRows = offers.locator("tbody tr");
  const more = offers.getByRole("button", { name: "Show more listings", exact: true });
  await expect(marketRows).toHaveCount(20);
  const firstIds = await marketRows.evaluateAll(rows => rows.map(row => row.getAttribute("data-listing-id")));
  expect(await marketRows.first().evaluate(row => row.getBoundingClientRect().height)).toBeLessThanOrEqual(36);
  await offers.screenshot({ path: ".local/market-compact-20.jpg", type: "jpeg", quality: 75 });

  let failExpansion = true;
  await page.route("**/rest/v1/rpc/list_market_listings", route => {
    if (failExpansion && route.request().postDataJSON()?.requested_page === 1) {
      failExpansion = false;
      return route.abort("failed");
    }
    return route.continue();
  });
  await more.click();
  await expect(offers.getByRole("button", { name: "Retry listings", exact: true })).toBeVisible();
  await expect(marketRows).toHaveCount(20);
  await offers.getByRole("button", { name: "Retry listings", exact: true }).click();
  await expect(marketRows).toHaveCount(40);
  expect(await marketRows.evaluateAll(rows => rows.slice(0, 20).map(row => row.getAttribute("data-listing-id")))).toEqual(firstIds);

  const cancel = await seller.api.rpc("cancel_market_listing", { listing_id: cheapestId, request_id: crypto.randomUUID() });
  expect(cancel.error).toBeNull();
  listingIds.delete(cheapestId);
  await expect(offers.locator('[data-listing-id="' + cheapestId + '"]')).toHaveCount(0);
  await expect(marketRows).toHaveCount(40);
  while (await more.isVisible()) {
    const previousCount = await marketRows.count();
    await more.click();
    await expect.poll(() => marketRows.count()).toBeGreaterThan(previousCount);
    expect(await marketRows.count()).toBeLessThanOrEqual(previousCount + 20);
  }
  const visible = await marketRows.evaluateAll(rows => rows.map(row => ({
    id: row.getAttribute("data-listing-id")!,
    price: Number(row.querySelector(".o-market-price")!.textContent!.replace(/[^0-9]/g, "")),
  })));
  expect(new Set(visible.map(row => row.id)).size).toBe(visible.length);
  const seenPrices = visible.map(row => row.price);
  expect(seenPrices).toEqual([...seenPrices].sort((a, b) => a - b));
  expect(visible.filter(row => listingIds.has(row.id))).toHaveLength(44);
  await expect(more).toHaveCount(0);
  for (const width of [375, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 375) await offers.screenshot({ path: ".local/market-compact-mobile.jpg", type: "jpeg", quality: 75 });
  }
  await page.goto("/harbor/marketplace/listings");
  await expect(page.getByText("You have no active listings.", { exact: true })).toBeVisible();
  await page.goto("/harbor/marketplace");
  await expect(page.locator(".o-market-card").getByText("sold /", { exact: false })).toHaveCount(0);
  await page.getByLabel("Search market items", { exact: true }).fill("zz-no-market-item");
  await page.getByRole("button", { name: "Search market", exact: true }).click();
  await expect(page.getByText("No items match this selection. Try another category or search.", { exact: true })).toBeVisible();
});

test("an attacked defender can inspect the market but cannot buy, list or withdraw offers", async ({ page }) => {
  const seller = await captain(true), defender = await captain(true), attacker = await captain();
  testSql("update public.characters set gold_coins=1000,ship_defense=10000,crew_defense=10000 where id='" + defender.id + "';");
  const listing = await offer(seller, "linen_bandages", 2, 10);
  const owned = await offer(defender, "brass_compass", 1, 10);
  await loginTestAccount(page, defender);
  await page.goto("/harbor/marketplace");
  const offers = await openOffers(page, "Linen Bandages");
  await expect(offers.getByRole("button", { name: "Buy Linen Bandages from " + seller.name, exact: true })).toBeEnabled();
  const battle = await attacker.api.rpc("start_combat", { target_id: defender.id, request_id: crypto.randomUUID() });
  expect(battle.error).toBeNull();
  await expect(offers.getByRole("button", { name: "Buy Linen Bandages from " + seller.name, exact: true })).toBeDisabled();
  expect((await defender.api.rpc("buy_market_listing", { listing_id: listing.id, quantity: 1, expected_unit_price: 10, request_id: crypto.randomUUID() })).error?.message).toBe("IN_COMBAT");
  expect((await defender.api.rpc("cancel_market_listing", { listing_id: owned.id, request_id: crypto.randomUUID() })).error?.message).toBe("IN_COMBAT");
  const stack = (await inventory(defender)).find(item => item.item_id === "linen_bandages")!;
  expect((await defender.api.rpc("create_market_listings", { entries: [{ entry_id: stack.id, entry_type: "stack", quantity: 1, unit_price: 1 }], request_id: crypto.randomUUID() })).error?.message).toBe("IN_COMBAT");
  await page.goto("/harbor/marketplace/add");
  await expect(page.getByRole("button", { name: "Add to Market", exact: true })).toBeDisabled();
  await page.goto("/harbor/marketplace/listings");
  await expect(page.getByRole("button", { name: "Cancel listing", exact: true })).toBeDisabled();
});
