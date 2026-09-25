import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { cleanupTestAccounts, createTestAccount, loginTestAccount, testSql } from "../support/accounts";
import { economyJournalKey } from "../../src/lib/economy-journal";

async function recipeFor(own: Awaited<ReturnType<typeof createTestAccount>>) {
  const recipes = await own.api.rpc("list_crafting_recipes");
  expect(recipes.error).toBeNull();
  return recipes.data!.find(recipe => recipe.id === "oak_plank")!;
}

test("hideout crafting instantly consumes logs, shows inventory and updates across tabs", async ({ page, context }) => {
  const accounts: Awaited<ReturnType<typeof createTestAccount>>[] = [];
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    await page.goto("/hideout/crafting");
    await expect(page).toHaveURL(/\/login$/);
    const own = await createTestAccount("crafting-ui"); accounts.push(own);
    testSql(`insert into private.item_stacks(character_id,item_id,quantity) values('${own.id}','oak_logs',9);
      update public.characters set stamina_updated_at=clock_timestamp()+interval '1 day' where id='${own.id}';`);
    await loginTestAccount(page, own);
    const nav = page.getByRole("navigation", { name: "Harbor locations" });
    const main = page.getByRole("main");
    await nav.getByRole("link", { name: "Hideout", exact: true }).click();
    const sidebar = (await page.getByRole("complementary", { name: "Character and harbor navigation" }).elementHandle())!;
    const documents: string[] = [];
    page.on("request", request => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents.push(request.url()); });
    await main.getByRole("link", { name: "Crafting", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/hideout\/crafting$/);
    await expect(nav.getByRole("link", { name: "Hideout", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(main.getByRole("heading", { name: "Crafting", exact: true })).toBeVisible();
    await expect(main.getByText("Instant craft", { exact: true })).toBeVisible();
    await expect(main.getByLabel("Oak Logs owned", { exact: true })).toHaveText("9");
    await expect(main.getByLabel("Oak Planks owned", { exact: true })).toHaveText("0");
    const craft = main.getByRole("button", { name: "Craft Oak Plank", exact: true });
    const otherTab = await context.newPage();
    try {
      await otherTab.goto("/hideout/crafting");
      await expect(otherTab.getByLabel("Oak Logs owned", { exact: true })).toHaveText("9");
      await craft.click();
      await expect(main.getByRole("status").filter({ hasText: "Crafted 1" })).toHaveText("Crafted 1 × Oak Plank. Used 5 × Oak Logs.");
      await expect(page.getByRole("region", { name: "Crafting XP gained", exact: true })).toContainText("+10 XP");
      await expect(main.getByLabel("Oak Logs owned", { exact: true })).toHaveText("4");
      await expect(main.getByLabel("Oak Planks owned", { exact: true })).toHaveText("1");
      await expect(craft).toBeDisabled();
      await expect(main.getByText(/Need 1 more/)).toBeVisible();
      await expect(otherTab.getByLabel("Oak Logs owned", { exact: true })).toHaveText("4");
      await expect(otherTab.getByRole("button", { name: "Craft Oak Plank", exact: true })).toBeDisabled();
      testSql(`update private.item_stacks set quantity=5 where character_id='${own.id}' and item_id='oak_logs'; select private.notify_training('${own.id}');`);
      await expect(craft).toBeEnabled();
      await expect(otherTab.getByLabel("Oak Logs owned", { exact: true })).toHaveText("5");
      await craft.click();
      await expect(main.getByLabel("Oak Logs owned", { exact: true })).toHaveText("0");
      await expect(main.getByLabel("Oak Planks owned", { exact: true })).toHaveText("2");
      await expect(craft).toBeDisabled();
    } finally { await otherTab.close(); }
    expect(await sidebar.evaluate(element => element.isConnected)).toBe(true);
    await expect(page.getByRole("progressbar", { name: "Stamina", exact: true })).toHaveAttribute("aria-valuenow", "50");
    await expect(page.getByRole("progressbar", { name: "Energy", exact: true })).toHaveAttribute("aria-valuenow", "100");
    for (const width of [1440, 768, 375, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(craft).toBeVisible();
      if (width === 1440 || width === 375) await page.screenshot({ path: `.local/crafting-${width}.jpg`, type: "jpeg", quality: 65, fullPage: true });
    }
    await main.getByRole("link", { name: "View your inventory", exact: true }).click();
    await expect(page).toHaveURL(/\/inventory$/);
    await expect(page.getByRole("button", { name: "Oak Planks details", exact: true })).toBeVisible();
    expect((await own.api.rpc("list_inventory")).data!.items.find(item => item.item_id === "oak_planks")!.quantity).toBe(2);
    await page.goBack();
    await expect(main.getByRole("heading", { name: "Crafting", exact: true })).toBeVisible();
    await nav.getByRole("link", { name: "Hideout", exact: true }).click();
    await expect(main.getByLabel("Crafting XP", { exact: true })).toHaveText("20");
    expect(documents).toEqual([]);
    expect(errors).toEqual([]);
  } finally { await page.close(); await cleanupTestAccounts(accounts); }
});

test("parallel crafts cannot duplicate outputs, overspend logs or consume market stock", async () => {
  const own = await createTestAccount("crafting-concurrent");
  try {
    testSql(`insert into private.item_stacks(character_id,item_id,quantity) values('${own.id}','oak_logs',15);`);
    const recipe = await recipeFor(own), offer = { recipe_id: recipe.id, expected_version: recipe.version };
    const request_id = randomUUID();
    const duplicates = await Promise.all(Array.from({ length: 8 }, () => own.api.rpc("craft_item", { ...offer, request_id })));
    expect(duplicates.every(result => !result.error && JSON.stringify(result.data) === JSON.stringify(duplicates[0].data))).toBe(true);
    expect((await recipeFor(own)).ingredients[0].owned).toBe(10);
    const unique = await Promise.all(Array.from({ length: 8 }, () => own.api.rpc("craft_item", { ...offer, request_id: randomUUID() })));
    expect(unique.filter(result => !result.error)).toHaveLength(2);
    expect(unique.filter(result => result.error?.message === "INSUFFICIENT_MATERIALS")).toHaveLength(6);
    expect((await recipeFor(own)).output.owned).toBe(3);
    expect((await own.api.rpc("get_own_skills")).data!.skills.find(skill => skill.id === "crafting")!.xp).toBe(30);
    expect(testSql(`select count(*) from private.crafting_requests where character_id='${own.id}';`).trim()).toBe("3");
    testSql(`insert into private.item_stacks(character_id,item_id,quantity) values('${own.id}','oak_logs',5);`);
    const logs = (await own.api.rpc("list_inventory")).data!.items.find(item => item.item_id === "oak_logs")!;
    const listing = await own.api.rpc("create_market_listings", { entries: [{ entry_id: logs.id, entry_type: "stack", quantity: 5, unit_price: 1 }], request_id: randomUUID() });
    expect(listing.error).toBeNull();
    expect((await recipeFor(own)).ingredients[0].owned).toBe(0);
    expect((await own.api.rpc("craft_item", { ...offer, request_id: randomUUID() })).error?.message).toBe("INSUFFICIENT_MATERIALS");
  } finally { await cleanupTestAccounts([own]); }
});

test("a saved craft survives reload and returns its original result without consuming again", async ({ page }) => {
  const own = await createTestAccount("crafting-recovery");
  try {
    testSql(`insert into private.item_stacks(character_id,item_id,quantity) values('${own.id}','oak_logs',10);`);
    await loginTestAccount(page, own);
    const recipe = await recipeFor(own), request_id = randomUUID();
    expect((await own.api.rpc("craft_item", { recipe_id: recipe.id, expected_version: recipe.version, request_id })).error).toBeNull();
    await page.evaluate(({ key, request_id, version }) => localStorage.setItem(key, JSON.stringify({ kind: "crafting", id: request_id,
      fields: { request_id, recipe_id: "oak_plank", expected_version: version } })), { key: economyJournalKey(own.id), request_id, version: recipe.version });
    await page.goto("/hideout/crafting");
    const craft = page.getByRole("button", { name: "Craft Oak Plank", exact: true });
    await expect(craft).toBeDisabled();
    await page.getByRole("button", { name: "Check saved action", exact: true }).click();
    await expect(page.getByRole("region", { name: "Unconfirmed action", exact: true })).toHaveCount(0);
    await expect(craft).toBeEnabled();
    expect((await own.api.rpc("get_own_skills")).data!.skills.find(skill => skill.id === "crafting")!.xp).toBe(10);
    await expect(page.getByLabel("Oak Logs owned", { exact: true })).toHaveText("5");
    await expect(page.getByLabel("Oak Planks owned", { exact: true })).toHaveText("1");
    expect(testSql(`select count(*) from private.crafting_requests where character_id='${own.id}';`).trim()).toBe("1");
    testSql(`update public.characters set crew_health=0 where id='${own.id}';`);
    await page.goto("/hideout/crafting");
    await expect(page).toHaveURL(/\/harbor\/hospital$/);
    testSql(`update public.characters set hospital_started_at=clock_timestamp()-interval '301 seconds',hospital_until=clock_timestamp()-interval '1 second' where id='${own.id}';`);
    const state = await own.api.rpc("get_game_state");
    expect((await own.api.rpc("depart_harbor", { expected_version: state.data!.sea.version, request_id: randomUUID() })).error).toBeNull();
    await page.goto("/hideout/crafting");
    await expect(page).toHaveURL(/\/sea$/);
  } finally { await page.close(); await cleanupTestAccounts([own]); }
});
