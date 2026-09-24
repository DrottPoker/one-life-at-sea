import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createTestAccount, cleanupTestAccounts, loginTestAccount, testSql } from "../support/accounts";

test("admin authors items and loot, uploads artwork, links fishing and receives durable catches", async ({ page, browser }) => {
  test.setTimeout(120000);
  const admin = await createTestAccount("content-admin"), player = await createTestAccount("content-player");
  testSql("insert into private.admin_members(user_id) values('" + admin.userId + "'); update public.characters set stamina_updated_at=clock_timestamp()+interval '1 day' where id='" + player.id + "';");
  const tag = randomUUID().replaceAll("-", ""), itemId = "test_pearl_" + tag, tableId = "test_shore_" + tag;
  const originalBinding = JSON.parse(testSql("select to_jsonb(a) from private.activity_loot a where activity_id='shore_fishing'"));
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    const observed = window as unknown as { adminFlashes: number }; observed.adminFlashes = 0;
    new MutationObserver(records => { for (const record of records) for (const node of record.addedNodes) {
      if (node instanceof Element && (node.matches('[aria-label="Unconfirmed admin requests"]') || node.querySelector('[aria-label="Unconfirmed admin requests"]'))) observed.adminFlashes++;
    } }).observe(document, { childList: true, subtree: true });
  });
  const playerPage = await browser.newPage();
  try {
    await loginTestAccount(page, admin);
    await page.goto("/admin/items/new");
    await page.getByLabel("Item name", { exact: true }).fill("Test Pearl " + tag);
    await page.getByLabel("Description", { exact: true }).fill("A pearl created through the administrator tools.");
    await expect(page.locator('.admin-image-preview img')).toHaveAttribute("src", /\/images\/items\/placeholder\.svg$/);
    await page.getByLabel("Reason for change", { exact: true }).fill("Create a test collectible");
    await page.getByRole("button", { name: "Review item", exact: true }).click();
    await page.getByRole("button", { name: "Confirm change", exact: true }).click();
    await expect(page.getByText("Item saved.", { exact: true }).first()).toBeVisible();
    expect(testSql("select image_path from private.item_definitions where id='" + itemId + "'").trim()).toBe("/images/items/placeholder.svg");
    expect(await page.evaluate(() => (window as unknown as { adminFlashes: number }).adminFlashes)).toBe(0);
    await page.goto("/admin/items/" + itemId);
    await page.getByLabel("Upload image", { exact: true }).setInputFiles("public/images/items/cutlass.png");
    await expect(page.locator('.admin-image-preview img')).toHaveAttribute("src", /\/api\/item-images\//);
    await expect.poll(() => page.locator('.admin-image-preview img').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await page.getByLabel("Reason for change", { exact: true }).fill("Set the test item artwork");
    await page.getByRole("button", { name: "Review item", exact: true }).click();
    await page.getByRole("button", { name: "Confirm change", exact: true }).click();
    await expect.poll(() => testSql("select image_path from private.item_definitions where id='" + itemId + "'").trim()).toMatch(/^\/api\/item-images\//);
    const imagePath = testSql("select image_path from private.item_definitions where id='" + itemId + "'").trim();
    const anonymousImage = await fetch(new URL(imagePath, page.url()));
    expect(anonymousImage.ok).toBe(true);

    await page.goto("/admin/loot/new");
    await page.getByLabel("Table name", { exact: true }).fill("Test Shore " + tag);
    await test.step("Select the newly created item", async () => {
      await expect(page.getByRole("combobox", { name: "Item to add", exact: true }).locator('option[value="' + itemId + '"]')).toHaveCount(1);
      await page.getByRole("combobox", { name: "Item to add", exact: true }).selectOption(itemId, { timeout: 15000 });
    });
    await page.getByRole("button", { name: "Add item", exact: true }).click();
    await page.getByLabel("Test Pearl " + tag + " chance rule", { exact: true }).selectOption("fixed");
    await page.getByLabel("Test Pearl " + tag + " fixed chance", { exact: true }).fill("100");
    await page.getByLabel("Test Pearl " + tag + " quantity", { exact: true }).fill("2");
    await page.getByLabel("Reason for change", { exact: true }).fill("Create deterministic test catches");
    await page.getByRole("button", { name: "Review loot table", exact: true }).click();
    await page.getByRole("button", { name: "Confirm change", exact: true }).click();
    await expect.poll(async () => (await admin.api.rpc("admin_get_loot_table", { target_id: tableId })).data?.entries[0]?.quantity).toBe(2);

    await page.goto("/admin/activities");
    const shore = page.locator(".admin-card").filter({ has: page.getByRole("heading", { name: "Shore Fishing", exact: true }) });
    await shore.getByLabel("Shore Fishing loot table", { exact: true }).selectOption(tableId);
    await shore.getByLabel("Shore Fishing starting catch chance", { exact: true }).fill("100");
    await shore.getByLabel("Shore Fishing mastery catch chance", { exact: true }).fill("100");
    await shore.getByLabel("Reason for change").fill("Test the full fishing pipeline");
    await shore.getByRole("button", { name: "Review activity loot" }).click();
    await shore.getByRole("button", { name: "Confirm change" }).click();
    await expect.poll(() => testSql("select loot_table_id from private.activity_loot where activity_id='shore_fishing'").trim()).toBe(tableId);
    await loginTestAccount(playerPage, player);
    await playerPage.goto("/activities");
    await playerPage.getByRole("button", { name: "Fish for 1 Stamina", exact: true }).click();
    const fishingResult = playerPage.getByRole("region", { name: "Shore Fishing result", exact: true });
    await expect(fishingResult.getByRole("heading", { name: "Success", exact: true })).toBeVisible();
    await expect(fishingResult.getByRole("button", { name: "2 × Test Pearl " + tag, exact: true })).toBeVisible();
    const request = { activity_id: "shore_fishing", expected_stamina_cost: 1, expected_xp_gain: 10, request_id: randomUUID() };
    const repeated = await Promise.all(Array.from({ length: 8 }, () => player.api.rpc("perform_activity", request)));
    expect(repeated.every(result => !result.error && JSON.stringify(result.data) === JSON.stringify(repeated[0].data))).toBe(true);
    expect((await player.api.rpc("list_inventory")).data?.items.find(item => item.item_id === itemId)?.quantity).toBe(4);
    expect((await player.api.rpc("get_game_state")).data?.stamina).toBe(48);
    await playerPage.goto("/inventory");
    await expect(playerPage.getByRole("button", { name: "Test Pearl " + tag + " details", exact: true })).toBeVisible();
    await playerPage.getByRole("button", { name: "Test Pearl " + tag + " details", exact: true }).click();
    await expect.poll(() => playerPage.locator(".o-item-art img").evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);

    for (const path of ["/admin", "/admin/items", "/admin/loot/harbor_shore", "/admin/activities"]) {
      await page.goto(path);
      for (const width of [1440, 768, 375, 320]) {
        await page.setViewportSize({ width, height: 1000 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), path + " at " + width).toBe(true);
        if ([1440, 375].includes(width)) await page.screenshot({ path: ".local/admin-content-" + path.replaceAll("/", "-") + "-" + width + ".png", fullPage: true });
      }
    }
    expect(errors).toEqual([]);
    const invalidUpload = await player.api.storage.from("item-images").upload(player.userId + "/" + randomUUID() + ".png", Buffer.from("untrusted"), { contentType: "image/png" });
    expect(invalidUpload.error).not.toBeNull();
    expect((await player.api.rpc("admin_get_loot_table", { target_id: tableId })).error?.message).toBe("ADMIN_REQUIRED");
  } finally {
    await playerPage.close();
    testSql("update private.activity_loot set loot_table_id='" + originalBinding.loot_table_id + "',success_start=" + originalBinding.success_start + ",success_end=" + originalBinding.success_end + ",mastery_level=" + originalBinding.mastery_level + ",version='" + originalBinding.version + "' where activity_id='shore_fishing';");
    await cleanupTestAccounts([admin, player]);
    testSql("delete from private.loot_entries where loot_table_id='" + tableId + "'; delete from private.loot_tables where id='" + tableId + "'; delete from private.item_circulation_history where item_id='" + itemId + "'; delete from private.item_circulation where item_id='" + itemId + "'; delete from private.item_definitions where id='" + itemId + "';");
  }
});

test("admin creates equipment with the stat ranges its slot requires", async ({ page }) => {
  const admin = await createTestAccount("content-admin");
  testSql("insert into private.admin_members(user_id) values('" + admin.userId + "');");
  const tag = randomUUID().replaceAll("-", ""), itemId = "test_hull_" + tag;
  try {
    await loginTestAccount(page, admin);
    await page.goto("/admin/items/new");
    await page.getByLabel("Item name", { exact: true }).fill("Test Hull " + tag);
    await page.getByLabel("Description", { exact: true }).fill("Hull planking created through the administrator tools.");
    await page.getByRole("combobox", { name: "Item type", exact: true }).selectOption("equipment");
    await expect(page.getByLabel("Damage min", { exact: true })).toBeVisible();
    await page.getByRole("combobox", { name: "Equipment slot", exact: true }).selectOption("hull");
    await expect(page.getByLabel("Damage min", { exact: true })).toHaveCount(0);
    await page.getByLabel("Armor min", { exact: true }).fill("4");
    await page.getByLabel("Armor max", { exact: true }).fill("8.5");
    await page.getByLabel("Ship Health min", { exact: true }).fill("5");
    await page.getByLabel("Ship Health max", { exact: true }).fill("20");
    await page.getByLabel("Reason for change", { exact: true }).fill("Create a test hull");
    await page.getByRole("button", { name: "Review item", exact: true }).click();
    await page.getByRole("button", { name: "Confirm change", exact: true }).click();
    await expect(page.getByText("Item saved.", { exact: true }).first()).toBeVisible();
    expect(testSql("select concat_ws(',',slot,armor_min,armor_max,health_min,health_max,coalesce(damage_min::text,'none')) from private.item_definitions where id='" + itemId + "'").trim())
      .toBe("hull,4.00,8.50,5.00,20.00,none");
    await page.goto("/admin/items/" + itemId);
    await page.getByLabel("Armor max", { exact: true }).fill("99");
    await page.getByLabel("Reason for change", { exact: true }).fill("Exceed the armor limit");
    await page.getByRole("button", { name: "Review item", exact: true }).click();
    await page.getByRole("button", { name: "Confirm change", exact: true }).click();
    await expect(page.getByText(/Check the equipment stats/)).toBeVisible();
    expect(testSql("select armor_max from private.item_definitions where id='" + itemId + "'").trim()).toBe("8.50");
  } finally {
    testSql("delete from private.item_circulation_history where item_id='" + itemId + "'; delete from private.item_circulation where item_id='" + itemId + "'; delete from private.item_definitions where id='" + itemId + "';");
    await cleanupTestAccounts([admin]);
  }
});
