import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createTestAccount, createTestClient as client, testSql as sql,
  loginTestAccount as login, cleanupTestAccounts as cleanup } from "../support/accounts";
import { inventoryFixtureSql } from "../../scripts/inventory-fixture.mjs";

async function account(seed = true) {
  const own = await createTestAccount("inventory");
  expect((await own.api.rpc("list_inventory")).data?.total).toBe(0);
  if (seed) {
    sql(inventoryFixtureSql(own.id));
    sql(inventoryFixtureSql(own.id));
    expect((await own.api.rpc("list_inventory")).data?.total).toBe(7);
  }
  return own;
}

test("inventory rows, categories, details, item images and mobile layout", async ({ page }) => {
  const own = await account();
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    await login(page, own);
    await page.getByRole("link", { name: "Inventory", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Inventory", exact: true })).toBeVisible();
    const list = page.getByRole("list", { name: "Your items" });
    await expect(list.locator(":scope > li")).toHaveCount(7);
    await expect(list.getByRole("button", { name: /^Equip / })).toHaveCount(3);
    for (const button of await list.getByRole("button", { name: /^Equip / }).all()) await expect(button).toBeEnabled();
    await expect(list.getByRole("button", { name: "Use", exact: true })).toHaveCount(2);
    for (const button of await list.getByRole("button", { name: "Use", exact: true }).all()) await expect(button).toBeDisabled();
    const inventory = (await own.api.rpc("list_inventory")).data!;
    const weapons = inventory.items.filter(i => i.item_id === "cutlass");
    expect(new Set(weapons.map(i => i.stats!.damage)).size).toBe(2);
    expect(weapons.map(i => i.stats!.quality).sort()).toEqual([30, 80]);
    const first = page.locator('[data-item-id="' + weapons[0].id + '"]');
    await first.getByRole("button", { name: "Sailor's Cutlass details", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(first.getByRole("region", { name: "Sailor's Cutlass details", exact: true })).toBeVisible();
    await expect(first.getByText(weapons[0].stats!.damage!.toFixed(2), { exact: true })).toHaveCount(2);
    await expect(first.getByRole("img", { name: "Sailor's Cutlass", exact: true })).toBeVisible();
    await expect.poll(() => first.getByRole("img", { name: "Sailor's Cutlass", exact: true }).evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await page.getByRole("button", { name: "Deck Cannon details", exact: true }).click();
    await expect(first.getByRole("region")).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Deck Cannon details", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Close Deck Cannon details", exact: true }).click();
    await first.getByRole("button", { name: "Sailor's Cutlass details", exact: true }).click();
    for (const width of [1280, 768, 375, 320]) {
      await page.setViewportSize({ width, height: 1100 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const row = await first.locator(".o-item-row").boundingBox();
      expect(row!.width).toBeLessThanOrEqual(width);
    }
    await page.setViewportSize({ width: 1280, height: 1000 });
    await expect.poll(() => page.locator(".o-item-thumb img").evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0)) ).toBe(true);
    for (const thumb of await page.locator(".o-item-thumb").all()) {
      const parent = await thumb.boundingBox(), image = await thumb.locator("img").boundingBox();
      expect(image!.y + image!.height).toBeLessThanOrEqual(parent!.y + parent!.height);
    }
    await page.screenshot({ path: ".local/inventory-desktop.png", fullPage: true });
    await page.setViewportSize({ width: 375, height: 1000 });
    await page.screenshot({ path: ".local/inventory-mobile.png", fullPage: true });
    await page.getByRole("navigation", { name: "Item categories" }).getByRole("link", { name: "Medical", exact: true }).click();
    await expect(list.locator(":scope > li")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Linen Bandages details", exact: true })).toContainText("x10");
    await page.getByLabel("Search items", { exact: true }).fill("cutlass");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByText("No items match this selection.", { exact: true })).toBeVisible();
    await page.getByRole("navigation", { name: "Item categories" }).getByRole("link", { name: "Crew Weapons", exact: true }).click();
    await expect(list.locator(":scope > li")).toHaveCount(2);
    await page.getByRole("link", { name: "Clear search", exact: true }).click();
    await expect(page.getByLabel("Search items", { exact: true })).toHaveValue("");
    await page.reload();
    await expect(list.locator(":scope > li")).toHaveCount(2);
    expect(errors).toEqual([]);
  } finally { await cleanup([own]); }
});

test("trash confirms exact quantities, preserves other equipment, and updates another tab", async ({ page, context }) => {
  const own = await account();
  const second = await context.newPage();
  try {
    await login(page, own);
    await page.goto("/inventory");
    await second.goto("/inventory");
    const cutlass = (await own.api.rpc("list_inventory", { category_id: "crew_weapons" })).data!.items[0];
    const row = page.locator('[data-item-id="' + cutlass.id + '"]');
    await row.getByRole("button", { name: "Trash Sailor's Cutlass", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(page.getByRole("region", { name: "Sailor's Cutlass details", exact: true })).toHaveCount(0);
    await expect(dialog).toContainText("Damage " + cutlass.stats!.damage!.toFixed(2));
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Trash Sailor's Cutlass", exact: true }).click();
    await dialog.getByRole("button", { name: "Destroy 1 item", exact: true }).click();
    await expect(row).toHaveCount(0);
    await expect(second.locator('[data-item-id="' + cutlass.id + '"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Sailor's Cutlass details", exact: true })).toHaveCount(1);
    await page.getByRole("button", { name: "Linen Bandages details", exact: true }).click();
    await page.getByRole("button", { name: "Trash Linen Bandages", exact: true }).click();
    await dialog.getByLabel("Quantity to destroy", { exact: true }).fill("11");
    await expect(dialog.getByRole("button", { name: "Destroy 11 items", exact: true })).toBeDisabled();
    await dialog.getByLabel("Quantity to destroy", { exact: true }).fill("10");
    await expect(dialog.getByRole("button", { name: "Destroy 10 items", exact: true })).toBeEnabled();
    const bandages = (await own.api.rpc("list_inventory", { category_id: "medical" })).data!.items[0];
    expect((await own.api.rpc("trash_inventory_item", { entry_id: bandages.id, entry_type: "stack", quantity: 1, request_id: randomUUID() })).error).toBeNull();
    await expect(dialog.getByText("9 currently available.", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Destroy 10 items", exact: true })).toBeDisabled();
    await dialog.getByLabel("Quantity to destroy", { exact: true }).fill("2");
    await dialog.getByRole("button", { name: "Destroy 2 items", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Linen Bandages details", exact: true })).toContainText("x7");
    await expect(second.getByRole("button", { name: "Linen Bandages details", exact: true })).toContainText("x7");
    await expect(page.getByRole("region", { name: "Linen Bandages details", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Trash Linen Bandages", exact: true }).click();
    await dialog.getByLabel("Quantity to destroy", { exact: true }).fill("7");
    await dialog.getByRole("button", { name: "Destroy 7 items", exact: true }).click();
    await expect(page.getByRole("button", { name: "Linen Bandages details", exact: true })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Linen Bandages details", exact: true })).toHaveCount(0);
    expect((await own.api.rpc("get_game_state")).data).toMatchObject({ gold_coins: 0, crew_attack: 10, energy: 100 });
    await page.getByRole("button", { name: "Log out", exact: true }).filter({ visible: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await login(page, own);
    await page.goto("/inventory");
    await expect(page.getByRole("list", { name: "Your items" }).locator(":scope > li")).toHaveCount(5);
  } finally { await second.close(); await cleanup([own]); }
});

test("equipment moves between the bag and the loadout and cannot be destroyed or listed while equipped", async ({ page }) => {
  const own = await account();
  try {
    await login(page, own);
    await page.goto("/inventory");
    const weapons = (await own.api.rpc("list_inventory", { category_id: "crew_weapons" })).data!.items;
    const best = weapons.find(item => item.stats!.quality === 80)!;
    const row = page.locator('[data-item-id="' + best.id + '"]');
    const equipment = page.getByRole("region", { name: "Equipment", exact: true });
    const focus = equipment.locator(".o-loadout-focus");
    await expect(equipment.getByRole("button", { name: "Melee: Fists", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(focus.getByLabel("Damage 10.00", { exact: true })).toBeVisible();
    await expect(focus).toContainText("No equipment.");
    await row.getByRole("button", { name: "Equip Sailor's Cutlass", exact: true }).click();
    await expect(equipment.getByRole("button", { name: "Melee: Sailor's Cutlass", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(row.getByText("Equipped", { exact: true })).toBeVisible();
    await expect(equipment.getByRole("button", { name: "Melee: Sailor's Cutlass", exact: true }).locator("img")).toBeVisible();
    await expect(focus).toContainText("Sailor's Cutlass");
    await expect(focus.getByLabel("Quality 80.00%", { exact: true })).toBeVisible();
    await equipment.getByRole("button", { name: "Hull: Empty", exact: true }).click();
    await expect(focus).toContainText("Nothing equipped");
    await equipment.getByRole("button", { name: "Melee: Sailor's Cutlass", exact: true }).click();
    await expect(row.getByRole("button", { name: "Trash Sailor's Cutlass", exact: true })).toBeDisabled();
    expect((await own.api.rpc("create_market_listings", { entries: [{ entry_id: best.id, entry_type: "instance", quantity: 1, unit_price: 10 }],
      request_id: randomUUID() })).error?.message).toBe("ITEM_EQUIPPED");
    await page.reload();
    await expect(focus).toContainText("Sailor's Cutlass");
    await page.screenshot({ path: ".local/inventory-loadout.png", fullPage: true });
    await focus.getByRole("button", { name: "Unequip Sailor's Cutlass", exact: true }).click();
    await expect(equipment.getByRole("button", { name: "Melee: Fists", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(focus).toContainText("Fists");
    await expect(row.getByRole("button", { name: "Trash Sailor's Cutlass", exact: true })).toBeEnabled();
    await page.setViewportSize({ width: 375, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await cleanup([own]); }
});

test("temporaries are equipped from their stack while shot types have no item action", async ({ page }) => {
  const own = await account(false);
  try {
    sql("insert into private.item_stacks(character_id,item_id,quantity) values('" + own.id + "','grenado',2),('" + own.id + "','chain_shot',3); select private.notify_training('" + own.id + "');");
    await login(page, own);
    await page.goto("/inventory");
    const grenado = page.locator(".o-item").filter({ hasText: "Grenado" });
    const chain = page.locator(".o-item").filter({ hasText: "Chain Shot" });
    await expect(chain.getByRole("button", { name: /^(Use|Equip)/ })).toHaveCount(0);
    await grenado.getByRole("button", { name: "Equip Grenado", exact: true }).click();
    const equipment = page.getByRole("region", { name: "Equipment", exact: true });
    const slot = equipment.locator('.o-loadout-focus[data-slot="temporary"]');
    await expect(equipment.getByRole("button", { name: "Temporary: Grenado", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(slot).toContainText("Grenado");
    await expect(slot.getByLabel("Quantity 2", { exact: true })).toBeVisible();
    await expect(slot.getByLabel("Damage 25.00", { exact: true })).toBeVisible();
    await expect(grenado.getByText("Equipped", { exact: true })).toBeVisible();
    await expect(grenado.getByRole("button", { name: "Trash Grenado", exact: true })).toBeEnabled();
    await page.screenshot({ path: ".local/inventory-temporary.png", fullPage: true });
    await slot.getByRole("button", { name: "Unequip Grenado", exact: true }).click();
    await expect(slot).toContainText("Empty");
    await expect(equipment.getByRole("button", { name: "Temporary: Empty", exact: true })).toBeVisible();
  } finally { await cleanup([own]); }
});

test("the loadout panel keeps one size for every slot and its art stays inside the frames", async ({ page }) => {
  const own = await account(false);
  const id = (prefix: string) => prefix + "0000-0000-4000-8000-" + own.id.slice(-12);
  try {
    sql("insert into private.item_instances(id,character_id,item_id,quality) values('" + id("e2e5") + "','" + own.id + "','flintlock_pistol',96.45)," +
      "('" + id("e2e6") + "','" + own.id + "','cutlass',28.41),('" + id("e2e7") + "','" + own.id + "','canvas_sails',48.28);" +
      "insert into private.item_stacks(id,character_id,item_id,quantity) values('" + id("e2e8") + "','" + own.id + "','smoke_pot',3)");
    for (const prefix of ["e2e5", "e2e6", "e2e7", "e2e8"]) expect((await own.api.rpc("equip_item", { entry_id: id(prefix), request_id: randomUUID() })).error).toBeNull();
    await login(page, own);
    await page.goto("/inventory");
    const equipment = page.getByRole("region", { name: "Equipment", exact: true });
    await expect(equipment.getByRole("button", { name: "Firearm: Flintlock Pistol", exact: true })).toBeVisible();
    for (const width of [1280, 375]) {
      await page.setViewportSize({ width, height: 1000 });
      const sizes = new Set<string>();
      for (const tile of await equipment.locator(".o-loadout-tile").all()) {
        await tile.click();
        await expect(tile).toHaveAttribute("aria-pressed", "true");
        const layout = await equipment.evaluate(panel => {
          const within = (inner: Element, outer: Element) => {
            const a = inner.getBoundingClientRect(), b = outer.getBoundingClientRect();
            return a.top >= b.top - 0.5 && a.bottom <= b.bottom + 0.5 && a.left >= b.left - 0.5 && a.right <= b.right + 0.5;
          };
          const frame = panel.querySelector(".o-loadout-focus-art")!, copy = panel.querySelector(".o-loadout-focus-copy")!;
          return { size: panel.getBoundingClientRect().height + "/" + panel.querySelector(".o-loadout-focus")!.getBoundingClientRect().height,
            art: [...frame.querySelectorAll("img, svg")].every(art => within(art, frame)),
            tiles: [...panel.querySelectorAll(".o-loadout-tile")].every(tile => [...tile.querySelectorAll("img, svg")].every(art => within(art, tile))),
            overflow: [...copy.children].filter(child => child.scrollHeight > child.clientHeight + 1 || !within(child, copy))
              .map(child => child.tagName + "." + child.className + " " + child.scrollHeight + ">" + child.clientHeight) };
        });
        expect(layout, width + " " + await tile.getAttribute("data-slot")).toMatchObject({ art: true, tiles: true, overflow: [] });
        sizes.add(layout.size);
        await equipment.screenshot({ path: ".local/loadout/" + width + "-" + await tile.getAttribute("data-slot") + ".png" });
      }
      expect([...sizes]).toHaveLength(1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(equipment.locator(".o-loadout-focus")).toContainText("Heavy Canvas Sails");
    await equipment.getByRole("button", { name: "Temporary: Smoke Pot", exact: true }).click();
    await expect(equipment.locator(".o-loadout-focus")).toContainText("Accuracy -67% for 3 rounds");
  } finally { await cleanup([own]); }
});

test("a lost trash response is safely retried even after the last item disappears", async ({ page }) => {
  const own = await account();
  try {
    await login(page, own);
    await page.goto("/inventory");
    let lost = false;
    await page.route("**/inventory", async route => {
      if (!lost && route.request().method() === "POST" && route.request().headers()["next-action"]) {
        lost = true;
        await route.fetch();
        await route.abort("failed");
      } else await route.continue();
    });
    await page.getByRole("button", { name: "Trash Brass Compass", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Destroy 1 item", exact: true }).click();
    await expect(page.getByRole("button", { name: "Retry trash action", exact: true })).toBeVisible();
    expect(lost).toBe(true);
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.getByRole("button", { name: "Retry last trash action", exact: true })).toBeVisible();
    await expect.poll(async () => (await own.api.rpc("list_inventory", { category_id: "miscellaneous" })).data?.total).toBe(0);
    await page.getByRole("button", { name: "Retry last trash action", exact: true }).click();
    await page.getByRole("button", { name: "Retry trash action", exact: true }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(page.getByText("Destroyed 1 × Brass Compass.", { exact: true })).toBeVisible();
    expect((await own.api.rpc("list_inventory")).data?.total).toBe(6);
  } finally { await cleanup([own]); }
});

test("hospital permits inventory reading and filtering while locking destruction", async ({ page, context }) => {
  const own = await account(), opponent = await account(false);
  try {
    await login(page, own);
    await page.goto("/inventory");
    sql("update public.characters set crew_health=0 where id='" + own.id + "'");
    await expect(page.getByText("You can view your inventory while in hospital. Items cannot be destroyed during your stay.", { exact: true })).toBeVisible({ timeout: 20000 });
    await expect(page).toHaveURL(/\/inventory$/);
    await page.getByRole("navigation", { name: "Item categories" }).getByRole("link", { name: "Medical", exact: true }).click();
    await page.getByRole("button", { name: "Linen Bandages details", exact: true }).click();
    await expect(page.getByRole("region", { name: "Linen Bandages details", exact: true })).toBeVisible();
    await expect(page.getByRole("list", { name: "Your items" }).locator(":scope > li")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Use", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Trash Linen Bandages", exact: true })).toBeDisabled();
    const stack = (await own.api.rpc("list_inventory", { category_id: "medical" })).data!.items[0];
    expect((await own.api.rpc("trash_inventory_item", { entry_id: stack.id, entry_type: "stack", quantity: 1, request_id: randomUUID() })).error?.message).toBe("IN_HOSPITAL");
    await page.reload();
    await expect(page.getByRole("heading", { name: "Inventory", exact: true })).toBeVisible();
    const tab = await context.newPage();
    await tab.goto("/inventory");
    await expect(tab.getByRole("heading", { name: "Inventory", exact: true })).toBeVisible();
    await tab.close();
    await page.getByRole("link", { name: "My Profile", exact: true }).click();
    await expect(page).toHaveURL(new RegExp("/players/" + own.playerNumber + "$"));
    await page.getByRole("link", { name: "Inventory", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Inventory", exact: true })).toBeVisible();
    await page.goto("/harbor/bank");
    await expect(page).toHaveURL(/\/harbor\/hospital$/);
    sql("update public.characters set hospital_started_at=clock_timestamp()-interval '6 minutes',hospital_until=clock_timestamp()-interval '1 minute' where id='" + own.id + "'");
    await page.goto("/inventory");
    await expect(page.getByRole("button", { name: "Trash Linen Bandages", exact: true })).toBeEnabled();
    expect((await own.api.rpc("start_combat", { target_id: opponent.id, request_id: randomUUID() })).error).toBeNull();
    await page.goto("/inventory");
    await expect(page).toHaveURL(new RegExp("/attack/" + opponent.playerNumber + "$"));
    expect((await own.api.rpc("trash_inventory_item", { entry_id: stack.id, entry_type: "stack", quantity: 1, request_id: randomUUID() })).error?.message).toBe("IN_COMBAT");
  } finally { await cleanup([own, opponent]); }
});

test("concurrent destruction cannot duplicate requests, overspend stacks or cross owners", async () => {
  const own = await account(), other = await account();
  try {
    const stack = (await own.api.rpc("list_inventory", { category_id: "medical" })).data!.items[0];
    const request = { entry_id: stack.id, entry_type: "stack" as const, quantity: 4, request_id: randomUUID() };
    const repeated = await Promise.all(Array.from({ length: 12 }, () => own.api.rpc("trash_inventory_item", request)));
    expect(repeated.every(r => !r.error && r.data?.remaining === 6)).toBe(true);
    const attempts = await Promise.all(Array.from({ length: 10 }, () => own.api.rpc("trash_inventory_item", { ...request, quantity: 1, request_id: randomUUID() })));
    expect(attempts.filter(r => !r.error)).toHaveLength(6);
    expect(attempts.filter(r => r.error?.message === "ITEM_NOT_FOUND")).toHaveLength(4);
    expect((await own.api.rpc("list_inventory", { category_id: "medical" })).data?.total).toBe(0);
    expect((await own.api.rpc("trash_inventory_item", request)).data?.remaining).toBe(6);
    expect((await own.api.rpc("trash_inventory_item", { ...request, quantity: 3 })).error?.message).toBe("REQUEST_CONFLICT");
    expect((await other.api.rpc("trash_inventory_item", request)).error?.message).toBe("ITEM_NOT_FOUND");
    expect((await other.api.rpc("list_inventory", { category_id: "medical" })).data?.items[0].quantity).toBe(10);
    expect((await client().rpc("list_inventory")).error?.code).toBe("42501");
  } finally { await cleanup([own, other]); }
});

test("empty inventory, server pagination, combined filters and stale final pages", async ({ page }) => {
  const own = await account(false);
  try {
    await login(page, own);
    await page.goto("/inventory");
    await expect(page.getByText("Your inventory is empty.", { exact: true })).toBeVisible();
    sql(inventoryFixtureSql(own.id));
    sql("insert into private.item_instances(character_id,item_id,quality) select '" + own.id + "','cutlass',n from generate_series(1,20) n; select private.notify_training('" + own.id + "');");
    await page.reload();
    const listing = page.getByRole("list", { name: "Your items" });
    await expect(listing.locator(":scope > li")).toHaveCount(25);
    await page.getByRole("link", { name: "Next page", exact: true }).click();
    await expect(listing.locator(":scope > li")).toHaveCount(2);
    const data = (await own.api.rpc("list_inventory", { requested_page: 1 })).data!;
    const firstPage = (await own.api.rpc("list_inventory")).data!;
    expect(data.items.every(i => !firstPage.items.some(p => p.id === i.id))).toBe(true);
    for (const item of data.items) expect((await own.api.rpc("trash_inventory_item", { entry_id: item.id, entry_type: item.entry_type, quantity: item.quantity, request_id: randomUUID() })).error).toBeNull();
    await page.reload();
    await expect(listing.locator(":scope > li")).toHaveCount(25);
    await expect(page.getByRole("navigation", { name: "Inventory pages" })).toHaveCount(0);
    await page.getByRole("navigation", { name: "Item categories" }).getByRole("link", { name: "Medical", exact: true }).click();
    await expect(listing.locator(":scope > li")).toHaveCount(1);
    await page.getByLabel("Search items", { exact: true }).fill("%");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByText("No items match this selection.", { exact: true })).toBeVisible();
  } finally { await cleanup([own]); }
});

test("circulation chart shows world totals, periods, inspection, refresh and hospital access", async ({ page }) => {
  const own = await account(), other = await account();
  const numbers = new Intl.NumberFormat("en-GB");
  let releaseRecovery = () => {};
  const recovery = new Promise<void>(resolve => { releaseRecovery = resolve; });
  try {
    await login(page, own);
    await page.goto("/inventory");
    await page.getByRole("button", { name: "Linen Bandages details", exact: true }).click();
    const details = page.getByRole("region", { name: "Linen Bandages details", exact: true });
    const first = (await own.api.rpc("get_item_circulation", { target_item: "linen_bandages" })).data!;
    expect(BigInt(first.total)).toBeGreaterThanOrEqual(BigInt(20));
    await expect(details.locator(".o-circulation-value")).toContainText(numbers.format(BigInt(first.total)));
    await details.getByRole("button", { name: "Show circulation history for Linen Bandages", exact: true }).click();
    const chart = page.getByRole("region", { name: "Linen Bandages circulation history", exact: true });
    const plot = chart.getByRole("slider", { name: "Circulation history timeline" });
    await expect(plot).toBeVisible();
    await expect(chart.getByRole("radio", { name: "All time", exact: true })).toBeChecked();
    const loadedAt = await chart.locator(".o-chart-caption").innerText();
    expect(loadedAt).toContain("UTC");
    await plot.focus();
    await page.keyboard.press("End");
    await expect(chart.getByRole("tooltip")).toContainText("Total in circulation: " + numbers.format(BigInt(first.total)));
    await expect(chart.getByRole("tooltip")).toContainText("UTC");
    await page.keyboard.press("Home");
    await expect(plot).toHaveAttribute("aria-valuenow", "0");
    await page.keyboard.press("ArrowRight");
    await expect(plot).toHaveAttribute("aria-valuenow", "1");
    const box = (await plot.boundingBox())!;
    await page.mouse.move(box.x + box.width * .55, box.y + 60);
    await expect(chart.getByRole("tooltip")).toBeVisible();
    for (const [period, label] of [["1m","Last month"],["3m","Last 3 months"],["6m","Last 6 months"],["1y","Last year"],["3y","Last 3 years"],["all","All time"]]) {
      const loaded = page.waitForResponse(response => response.url().includes("/rpc/get_item_circulation") &&
        response.request().postDataJSON()?.period === period);
      await chart.getByRole("radio", { name: label, exact: true }).check();
      await loaded;
      await expect(chart.locator(".o-chart-viewport")).toHaveAttribute("aria-busy", "false");
      await expect(plot).toBeVisible();
      await expect(chart.getByRole("radio", { name: label, exact: true })).toBeChecked();
    }
    await page.setViewportSize({ width: 1280, height: 1100 });
    await plot.focus();
    await page.keyboard.press("End");
    await page.screenshot({ path: ".local/circulation-desktop.png", fullPage: true });
    for (const width of [768,375,320]) {
      await page.setViewportSize({ width, height: 1100 });
      await expect(plot).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.setViewportSize({ width: 375, height: 1100 });
    await page.screenshot({ path: ".local/circulation-mobile.png", fullPage: true });
    const ownStack = (await own.api.rpc("list_inventory", { category_id: "medical" })).data!.items[0];
    const otherStack = (await other.api.rpc("list_inventory", { category_id: "medical" })).data!.items[0];
    const destroyed = await Promise.all([own,other].map((a,i) => a.api.rpc("trash_inventory_item", {
      entry_id: i === 0 ? ownStack.id : otherStack.id, entry_type: "stack", quantity: 1, request_id: randomUUID(),
    })));
    expect(destroyed.every(result => !result.error)).toBe(true);
    const expected = BigInt(first.total) - BigInt(2);
    expect((await own.api.rpc("get_item_circulation", { target_item: "linen_bandages" })).data!.total).toBe(String(expected));
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(details.locator(".o-circulation-value")).toContainText(numbers.format(expected), { timeout: 20000 });
    await plot.focus();
    await page.keyboard.press("End");
    await expect(chart.getByRole("tooltip")).toContainText("Total in circulation: " + numbers.format(expected), { timeout: 20000 });
    await details.getByRole("button", { name: "Hide circulation history for Linen Bandages", exact: true }).click();
    await expect(chart).toHaveCount(0);
    let recovering = false;
    await page.route("**/rest/v1/rpc/get_item_circulation", async route => {
      if (!recovering) {
        await route.fulfill({
          status: 503, contentType: "application/json", body: JSON.stringify({ code: "TEST_UNAVAILABLE", message: "Temporarily unavailable" }),
        });
      } else {
        // Background refresh must not remove Retry before the test clicks it.
        await recovery;
        await route.continue();
      }
    });
    await details.getByRole("button", { name: "Show circulation history for Linen Bandages", exact: true }).click();
    await expect(chart.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
    recovering = true;
    await chart.getByRole("button", { name: "Retry", exact: true }).click();
    releaseRecovery();
    await expect(plot).toBeVisible();
    await page.unroute("**/rest/v1/rpc/get_item_circulation");
    sql("update public.characters set crew_health=0 where id='" + own.id + "'");
    await page.reload();
    await page.getByRole("button", { name: "Linen Bandages details", exact: true }).click();
    await details.getByRole("button", { name: "Show circulation history for Linen Bandages", exact: true }).click();
    await expect(plot).toBeVisible();
    await expect(chart.getByRole("radio", { name: "All time", exact: true })).toBeChecked();
    await expect(page.getByRole("button", { name: "Trash Linen Bandages", exact: true })).toBeDisabled();
  } finally {
    releaseRecovery();
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await cleanup([own,other]);
  }
});

for (const viewport of [{ width: 1280, height: 640 }, { width: 375, height: 740 }]) {
  test("period switching keeps chart layout and scroll stable at " + viewport.width + "px", async ({ page }) => {
    const own = await account();
    let release = () => {};
    try {
      await page.setViewportSize(viewport);
      await login(page, own);
      await page.goto("/inventory");
      const row = page.getByRole("button", { name: "Sailor's Cutlass details", exact: true }).last();
      await row.click();
      const details = page.getByRole("region", { name: "Sailor's Cutlass details", exact: true });
      await details.getByRole("button", { name: "Show circulation history for Sailor's Cutlass", exact: true }).click();
      const chart = page.getByRole("region", { name: "Sailor's Cutlass circulation history", exact: true });
      const plot = chart.getByRole("slider", { name: "Circulation history timeline" });
      await expect(plot).toBeVisible();
      const originalPlot = (await plot.elementHandle())!;
      await page.evaluate(async () => {
        await document.fonts.ready;
        window.scrollTo(0, document.documentElement.scrollHeight);
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });
      const baseline = await page.evaluate(() => ({ scroll: scrollY, height: document.documentElement.scrollHeight }));
      expect(baseline.scroll).toBeGreaterThan(0);
      let requested = () => {};
      const started = new Promise<void>(resolve => { requested = resolve; });
      const held = new Promise<void>(resolve => { release = resolve; });
      let intercepted = false;
      await page.route("**/rest/v1/rpc/get_item_circulation", async route => {
        if (!intercepted && route.request().postDataJSON()?.period === "1m") {
          intercepted = true;
          requested();
          await held;
        }
        await route.continue();
      });
      await page.evaluate(() => {
        const state = window as typeof window & { chartFrames: { scroll: number; height: number }[]; chartFrameId: number };
        state.chartFrames = [];
        const record = () => {
          state.chartFrames.push({ scroll: scrollY, height: document.documentElement.scrollHeight });
          state.chartFrameId = requestAnimationFrame(record);
        };
        record();
      });
      await chart.getByRole("radio", { name: "Last month", exact: true }).check();
      await started;
      await expect(chart.getByRole("status")).toContainText("Loading");
      expect(await originalPlot.evaluate(element => element.isConnected)).toBe(true);
      await expect(plot).toBeVisible();
      const loading = await page.evaluate(() => ({ scroll: scrollY, height: document.documentElement.scrollHeight }));
      expect(loading.height).toBe(baseline.height);
      expect(Math.abs(loading.scroll - baseline.scroll)).toBeLessThanOrEqual(1);
      const loaded = page.waitForResponse(response => response.url().includes("/rpc/get_item_circulation") &&
        response.request().postDataJSON()?.period === "1m");
      release();
      await loaded;
      await expect(chart.getByRole("status")).toHaveCount(0);
      expect(await originalPlot.evaluate(element => element.isConnected)).toBe(true);
      const frames = await page.evaluate(async () => {
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const state = window as typeof window & { chartFrames: { scroll: number; height: number }[]; chartFrameId: number };
        cancelAnimationFrame(state.chartFrameId);
        return state.chartFrames;
      });
      expect(frames.length).toBeGreaterThan(2);
      expect(Math.max(...frames.map(frame => Math.abs(frame.scroll - baseline.scroll)))).toBeLessThanOrEqual(1);
      expect(frames.every(frame => frame.height === baseline.height)).toBe(true);
      await expect(chart.getByRole("radio", { name: "Last month", exact: true })).toBeFocused();
    } finally {
      release();
      await page.unrouteAll({ behavior: "ignoreErrors" });
      await cleanup([own]);
    }
  });
}
