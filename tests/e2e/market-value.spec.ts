import { test, expect } from "@playwright/test";
import { createTestAccount, cleanupTestAccounts, loginTestAccount, testSql } from "../support/accounts";
import { inventoryFixtureSql } from "../../scripts/inventory-fixture.mjs";

test("market value follows completed purchases in inventory and marketplace", async ({ page }) => {
  test.setTimeout(120_000);
  const seller = await createTestAccount("value-seller"), buyer = await createTestAccount("value-buyer");
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    testSql(inventoryFixtureSql(seller.id));
    testSql("update public.characters set gold_coins=10000 where id='" + buyer.id + "';");
    const inventory = await seller.api.rpc("list_inventory");
    const item = inventory.data!.items.find(item => item.item_id === "oak_planks")!;
    async function listing(quantity: number, price: number) {
      const response = await seller.api.rpc("create_market_listings", { entries: [{
        entry_id: item.id, entry_type: "stack", quantity, unit_price: price,
      }], request_id: crypto.randomUUID() });
      expect(response.error).toBeNull();
      if (response.data?.action !== "create") throw Error("Expected listing receipt");
      return response.data.listings[0].id;
    }
    const first = await listing(1, 100), second = await listing(9, 200);
    await listing(1, 1);
    await loginTestAccount(page, seller);
    await page.goto("/inventory");
    await page.getByRole("button", { name: "Oak Planks details", exact: true }).click();
    let details = page.getByRole("region", { name: "Oak Planks details", exact: true });
    const valueRow = details.locator(".o-item-properties > div").filter({ has: page.locator("dt").filter({ hasText: /^Value$/ }) });
    const circRow = details.locator(".o-item-properties > div").filter({ has: page.locator("dt").filter({ hasText: /^Circ\.$/ }) });
    await expect(valueRow).toContainText(item.market_value === null ? "N/A" : BigInt(item.market_value).toLocaleString("en-US"));
    const valueBounds = await valueRow.boundingBox(), circBounds = await circRow.boundingBox();
    expect(valueBounds!.x).toBeLessThan(circBounds!.x);
    expect(valueBounds!.y).toBe(circBounds!.y);
    await details.getByRole("button", { name: "Show market value history for Oak Planks", exact: true }).click();
    let chart = page.getByRole("region", { name: "Oak Planks market value history", exact: true });
    await expect(chart.getByRole("radio")).toHaveCount(6);
    const initial = await seller.api.rpc("get_item_market_value", { target_item: "oak_planks" });
    if (!initial.data!.points.length) await expect(chart.getByText("No completed market sales yet.")).toBeVisible();

    const firstRequest = { listing_id: first, quantity: 1, expected_unit_price: 100, request_id: crypto.randomUUID() };
    expect((await buyer.api.rpc("buy_market_listing", firstRequest)).error).toBeNull();
    expect((await buyer.api.rpc("buy_market_listing", firstRequest)).error).toBeNull();
    expect((await buyer.api.rpc("buy_market_listing", {
      listing_id: second, quantity: 9, expected_unit_price: 200, request_id: crypto.randomUUID(),
    })).error).toBeNull();
    expect(testSql("select count(*) from private.market_sales where buyer_id='" + buyer.id + "';").trim()).toBe("2");
    // Spread real test purchases over time without adding fictitious sales to the catalog.
    testSql("update private.market_sales set sold_at=clock_timestamp()-case when quantity=1 then interval '10 hours' else interval '2 hours' end where buyer_id='" + buyer.id + "';");
    const expected = testSql("select floor(sum(gross)::numeric/sum(quantity))::text from private.market_sales where item_id='oak_planks' and sold_at>statement_timestamp()-interval '12 hours' and sold_at<=statement_timestamp();").trim();
    await expect(valueRow.locator(".o-item-market-value")).toHaveText(BigInt(expected).toLocaleString("en-US"), { timeout: 25_000 });
    let plot = chart.getByRole("slider", { name: "Market value history timeline" });
    await expect(plot).toBeVisible();
    await plot.focus();
    await page.keyboard.press("End");
    await expect(chart.locator(".o-chart-readout")).toContainText("Average market value");
    await expect(chart.locator(".o-chart-readout strong")).toHaveText(BigInt(expected).toLocaleString("en-US"));

    for (const period of ["Last month", "Last 3 months", "Last 6 months", "Last year", "Last 3 years", "All time"]) {
      await chart.getByRole("radio", { name: period, exact: true }).check();
      await expect(chart.locator(".o-chart-viewport")).toHaveAttribute("aria-busy", "false");
      await expect(plot).toBeVisible();
    }
    const original = (await plot.elementHandle())!;
    await page.route("**/rest/v1/rpc/get_item_market_value", route => route.abort());
    await chart.getByRole("radio", { name: "Last month", exact: true }).check();
    await expect(chart.getByRole("status")).toContainText("Could not load");
    expect(await original.evaluate(node => node.isConnected)).toBe(true);
    await expect(plot).toBeVisible();
    await page.unroute("**/rest/v1/rpc/get_item_market_value");
    await chart.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(chart.getByRole("status")).toHaveCount(0);

    for (const width of [1280, 375, 320]) {
      await page.setViewportSize({ width, height: 1050 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await plot.focus();
      await page.keyboard.press("End");
      if (width !== 320) await page.screenshot({ path: ".local/market-value-" + width + ".png", fullPage: true, animations: "disabled" });
    }
    await details.getByRole("button", { name: "Show circulation history for Oak Planks", exact: true }).click();
    await expect(chart).toHaveCount(0);
    await expect(page.getByRole("slider", { name: "Circulation history timeline" })).toBeVisible();

    await page.setViewportSize({ width: 1280, height: 1050 });
    await page.goto("/harbor/marketplace");
    await page.getByRole("button", { name: "View Oak Planks details", exact: true }).focus();
    await page.getByRole("button", { name: "View Oak Planks details", exact: true }).click();
    details = page.getByRole("region", { name: "Oak Planks details", exact: true });
    await expect(details.locator(".o-item-market-value")).toHaveText(BigInt(expected).toLocaleString("en-US"));
    await details.getByRole("button", { name: "Show market value history for Oak Planks", exact: true }).click();
    chart = page.getByRole("region", { name: "Oak Planks market value history", exact: true });
    plot = chart.getByRole("slider", { name: "Market value history timeline" });
    await expect(plot).toBeVisible();
    await plot.focus();
    await page.keyboard.press("End");
    const marketPlot = (await plot.elementHandle())!;
    await chart.getByRole("radio", { name: "Last 3 months", exact: true }).check();
    await expect(chart.locator(".o-chart-viewport")).toHaveAttribute("aria-busy", "false");
    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: 1050 });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await expect(plot).toBeVisible();
      await expect(chart.getByRole("radio", { name: "Last 3 months", exact: true })).toBeChecked();
      expect(await marketPlot.evaluate(node => node.isConnected)).toBe(true);
    }
    await plot.focus();
    await page.keyboard.press("End");
    await expect(chart.locator(".o-chart-readout")).toContainText("Average market value");
    await page.screenshot({ path: ".local/market-value-marketplace.png", fullPage: true, animations: "disabled" });
    // An empty twelve-hour window retains the last nonempty value.
    testSql("update private.market_sales set sold_at=statement_timestamp()-interval '13 hours' where buyer_id='" + buyer.id + "';");
    const expired = await seller.api.rpc("get_item_market_value", { target_item: "oak_planks" });
    expect(expired.error).toBeNull();
    const retained = testSql("select floor(sum(gross)::numeric/sum(quantity))::text from private.market_sales where item_id='oak_planks' and sold_at<=statement_timestamp() and (sold_at>statement_timestamp()-interval '12 hours' or sold_at=(select max(sold_at) from private.market_sales where item_id='oak_planks' and sold_at<=statement_timestamp()));").trim();
    expect(expired.data!.total).toBe(retained);
    expect(retained).not.toBe("");

    await page.reload();
    await page.getByRole("button", { name: "View Oak Planks details", exact: true }).focus();
    await page.getByRole("button", { name: "View Oak Planks details", exact: true }).click();
    await expect(details.locator(".o-item-market-value")).toHaveText(BigInt(retained).toLocaleString("en-US"));
    await details.getByRole("button", { name: "Show market value history for Oak Planks", exact: true }).click();
    await plot.focus();
    await page.keyboard.press("End");
    await expect(chart.locator(".o-chart-readout strong")).toHaveText(BigInt(retained).toLocaleString("en-US"));
    expect(errors).toEqual([]);
  } finally {
    // Cleanup must run even if Playwright has already closed a timed-out page.
    if (!page.isClosed()) await page.unrouteAll({ behavior: "ignoreErrors" });
    testSql("delete from private.market_sales where buyer_id='" + buyer.id + "' or seller_id='" + seller.id + "';");
    await cleanupTestAccounts([seller, buyer]);
  }
});
