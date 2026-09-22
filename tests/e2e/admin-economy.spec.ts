import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createTestAccount, cleanupTestAccounts, loginTestAccount, testSql } from "../support/accounts";

test("economy monitors real trades, charts, inventory wealth and private access", async ({ page, browser }) => {
  test.setTimeout(120000);
  const admin = await createTestAccount("economy-admin"), buyer = await createTestAccount("economy-buyer");
  const tag = randomUUID().replaceAll("-", ""), priced = "economy_" + tag, unpriced = "unpriced_" + tag;
  const name = "Economy Pearl " + tag, unknownName = "Unpriced Pearl " + tag;
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const playerPage = await browser.newPage();
  const cronActive = testSql("select active from cron.job where jobname='economy-snapshot'").trim() === "t";
  try {
    testSql("select cron.alter_job(jobid,active=>false) from cron.job where jobname='economy-snapshot'");
    testSql("insert into private.admin_members(user_id) values('" + admin.userId + "'); update public.characters set gold_coins=1000,bank_gold_coins=9007199254740991 where id='" + admin.id + "'; update public.characters set gold_coins=10000 where id='" + buyer.id + "';" +
      "insert into private.item_definitions(id,category_id,name,description,effect_description,image_path,kind,stackable,tradable) values" +
      "('" + priced + "','materials','" + name + "','Fixture.','None.','/images/items/placeholder.svg','passive',true,true)," +
      "('" + unpriced + "','materials','" + unknownName + "','Fixture.','None.','/images/items/placeholder.svg','passive',true,true);" +
      "insert into private.item_stacks(character_id,item_id,quantity) values('" + admin.id + "','" + priced + "',20),('" + admin.id + "','" + unpriced + "',3);");
    const entry = (await admin.api.rpc("list_inventory")).data!.items.find(item => item.item_id === priced)!;
    const listing = await admin.api.rpc("create_market_listings", { entries: [{ entry_id: entry.id, entry_type: "stack", quantity: 8, unit_price: 250 }], request_id: randomUUID() });
    expect(listing.error).toBeNull();
    if (listing.data?.action !== "create") throw Error("Missing listing");
    expect((await buyer.api.rpc("buy_market_listing", { listing_id: listing.data.listings[0].id, quantity: 1, expected_unit_price: 250, request_id: randomUUID() })).error).toBeNull();
    const dashboard = await admin.api.rpc("admin_economy", { item_search: tag });
    expect(dashboard.error).toBeNull();
    const item = dashboard.data!.items.rows.find(row => row.id === priced)!;
    expect(item).toMatchObject({ inventory: "13", listed: "7", units: "20", unit_value: "250", total_value: "5000" });
    const owner = dashboard.data!.rankings!.coins!.find(player => player.id === admin.id)!;
    expect(owner).toMatchObject({ inventory_value: "3000", listed_value: "1750", unpriced_units: "3", bank: "9007199254740991" });
    await loginTestAccount(page, admin);
    await page.goto("/admin");
    await page.getByRole("navigation", { name: "Administration" }).getByRole("link", { name: "Economy", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Economy", exact: true })).toBeVisible();
    await expect(page.getByRole("slider")).toHaveCount(4);
    const chart = page.getByRole("slider", { name: "Gold Coins supply timeline", exact: true });
    await chart.focus(); await page.keyboard.press("Home"); await expect(chart).toHaveAttribute("aria-valuenow", "0");
    await page.keyboard.press("End"); await expect(chart).toHaveAttribute("aria-valuetext", /Gold Coins/);
    for (const period of ["24 hours", "30 days", "All history", "7 days"]) {
      await page.getByRole("button", { name: period, exact: true }).click();
      await expect(page.getByRole("button", { name: "Refresh", exact: true })).toBeEnabled();
    }
    const items = page.getByRole("region", { name: "All items", exact: true });
    await items.getByLabel("Find an item").fill(tag); await items.getByRole("button", { name: "Apply", exact: true }).click();
    const row = items.getByRole("row").filter({ has: page.getByRole("link", { name, exact: true }) });
    await expect(row).toContainText("5,000"); await expect(items.getByRole("row")).toHaveCount(3);
    await items.getByLabel("Sort items").selectOption("unpriced"); await items.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(items.locator("tbody tr").first()).toContainText(unknownName);
    const rankings = page.getByRole("region", { name: "Richest players", exact: true });
    for (const tab of ["Item wealth", "Combined wealth", "Gold Coins"]) {
      await rankings.getByRole("button", { name: tab, exact: true }).click();
      await expect(rankings.getByRole("button", { name: tab, exact: true })).toHaveAttribute("aria-pressed", "true");
    }
    await expect(rankings.getByRole("row").filter({ hasText: admin.name })).toContainText("9,007,199,254,740,991 banked");
    await page.route("**/rest/v1/rpc/admin_economy", route => route.abort());
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(page.locator(".economy-status")).toContainText("last successful update");
    await expect(row).toContainText("5,000");
    await page.unroute("**/rest/v1/rpc/admin_economy");
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(page.locator(".economy-status")).not.toContainText("last successful update");
    for (const width of [1440, 768, 375, 320]) {
      await page.setViewportSize({ width, height: 1050 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "No overflow at " + width).toBe(true);
      if ([1440, 375].includes(width)) await page.screenshot({ path: ".local/admin-economy-" + width + ".png", fullPage: true });
    }
    expect((await buyer.api.rpc("admin_economy")).error?.message).toBe("ADMIN_REQUIRED");
    await loginTestAccount(playerPage, buyer); await playerPage.goto("/admin/economy");
    await expect(playerPage.getByRole("heading", { name: "Economy", exact: true })).toHaveCount(0);
    testSql("delete from private.admin_members where user_id='" + admin.userId + "'");
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(page.locator(".admin-error[role=alert]")).toContainText("Administrator access is no longer available");
    expect(errors).toEqual([]);
  } finally {
    await playerPage.close();
    try {
    await cleanupTestAccounts([admin, buyer]);
    testSql("delete from private.market_sales where item_id in('" + priced + "','" + unpriced + "'); delete from private.market_listings where item_id in('" + priced + "','" + unpriced + "'); delete from private.item_circulation_history where item_id in('" + priced + "','" + unpriced + "'); delete from private.item_circulation where item_id in('" + priced + "','" + unpriced + "'); delete from public.market_item_events where item_id in('" + priced + "','" + unpriced + "'); delete from private.item_definitions where id in('" + priced + "','" + unpriced + "');");
    } finally {
    testSql("select cron.alter_job(jobid,active=>" + cronActive + ") from cron.job where jobname='economy-snapshot'");
    }
  }
});
