import { test, expect, type Page } from "@playwright/test";
import { createTestAccount, cleanupTestAccounts, loginTestAccount, testSql } from "../support/accounts";
import { inventoryFixtureSql } from "../../scripts/inventory-fixture.mjs";
import { economyJournalKey } from "../../src/lib/economy-journal";

type Captain = Awaited<ReturnType<typeof createTestAccount>>;
type ObservedWindow = Window & { recoveryInsertions: number };
const accounts: Captain[] = [];
const recovery = (page: Page) => page.getByRole("region", { name: "Unconfirmed action", exact: true });

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    const observed = window as unknown as ObservedWindow;
    observed.recoveryInsertions = 0;
    const selector = '[aria-label="Unconfirmed action"]';
    new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) {
        if (node instanceof Element && (node.matches(selector) || node.querySelector(selector))) observed.recoveryInsertions++;
      }
    }).observe(document, { childList: true, subtree: true });
  });
});
test.afterEach(async () => { await cleanupTestAccounts(accounts.splice(0)); });

async function captain() {
  const own = await createTestAccount("economy-feedback");
  accounts.push(own);
  testSql(inventoryFixtureSql(own.id));
  testSql("update public.characters set gold_coins=1000 where id='" + own.id + "';" +
    "update private.character_training set xp=100 where character_id='" + own.id + "' and training_group='crew';");
  return own;
}
async function holdNextResponse(page: Page, path: string) {
  let release!: () => void, received!: () => void, held = false;
  const released = new Promise<void>(resolve => { release = resolve; });
  const ready = new Promise<void>(resolve => { received = resolve; });
  await page.route("**" + path, async route => {
    if (!held && route.request().method() === "POST" && route.request().headers()["next-action"]) {
      held = true;
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      received();
      await released;
      if (!page.isClosed()) await route.fulfill({ response });
    } else await route.continue();
  });
  return { ready, release };
}
async function expectNoFlash(page: Page) {
  await expect(recovery(page)).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as ObservedWindow).recoveryInsertions)).toBe(0);
}

const actions = [
  { name: "skill activity", path: "/activities", button: "Fish for 1 Stamina" },
  { name: "crew drill", path: "/harbor/crew-training", button: "Train Attack for 5 Energy" },
  { name: "training tier purchase", path: "/harbor/crew-training", button: "Buy for 250 Gold Coins" },
  { name: "ship work", path: "/harbor/ship-upgrades", button: "Start work" },
  { name: "tavern meal", path: "/harbor/tavern", button: "Buy crew meal for 1,000 Gold Coins" },
  { name: "bank transfer", path: "/harbor/bank", button: "Deposit" },
  { name: "inventory destruction", path: "/inventory", button: "Destroy 2 items" },
  { name: "market listing", path: "/harbor/marketplace/add", button: "Add to Market" },
];
for (const action of actions) {
  test("a successful " + action.name + " never inserts recovery UI in either tab", async ({ page, context }) => {
    const own = await captain(), key = economyJournalKey(own.id);
    await loginTestAccount(page, own);
    await page.goto(action.path);
    if (action.name === "bank transfer") await page.getByLabel("Amount", { exact: true }).fill("40");
    if (action.name === "inventory destruction") {
      await page.getByRole("button", { name: "Trash Linen Bandages", exact: true }).click();
      await page.getByLabel("Quantity to destroy", { exact: true }).fill("2");
    }
    if (action.name === "market listing") {
      await page.getByLabel("Quantity of Linen Bandages", { exact: true }).fill("2");
      await page.getByLabel("Unit price for Linen Bandages", { exact: true }).fill("19");
    }
    const other = await context.newPage();
    await other.goto("/harbor/bank");
    await other.getByLabel("Amount", { exact: true }).fill("10");
    const held = await holdNextResponse(page, action.path);
    try {
      await page.getByRole("button", { name: action.button, exact: true }).click();
      await held.ready;
      await expect(other.getByLabel("Amount", { exact: true })).not.toBeEditable();
      await expect(other.getByRole("button", { name: "Deposit", exact: true })).toBeDisabled();
      expect(await page.evaluate(key => localStorage.getItem(key), key)).not.toBeNull();
      await expectNoFlash(page);
      await expectNoFlash(other);
      // A remounted journal must also wait for the original tab's active request.
      await other.reload();
      await expect(other.getByLabel("Amount", { exact: true })).not.toBeEditable();
      await expectNoFlash(other);
    } finally { held.release(); }
    await expect.poll(() => page.evaluate(key => localStorage.getItem(key), key)).toBeNull();
    await expect(page.locator('form[aria-busy="true"]')).toHaveCount(0);
    await expect(other.getByLabel("Amount", { exact: true })).toBeEditable();
    await expectNoFlash(page);
    await expectNoFlash(other);
    await other.close();
  });
}

test("closing a tab after a committed transfer exposes its receipt safely in another tab", async ({ page, context }) => {
  const own = await captain(), key = economyJournalKey(own.id);
  await loginTestAccount(page, own);
  await page.goto("/harbor/bank");
  await page.getByLabel("Amount", { exact: true }).fill("40");
  const other = await context.newPage();
  await other.goto("/harbor/bank");
  const held = await holdNextResponse(page, "/harbor/bank");
  try {
    await page.getByRole("button", { name: "Deposit", exact: true }).click();
    await held.ready;
    await expect(other.getByLabel("Amount", { exact: true })).not.toBeEditable();
    await expectNoFlash(other);
    await page.close();
  } finally { held.release(); }
  await expect(recovery(other)).toBeVisible();
  await recovery(other).getByRole("button", { name: "Check saved action", exact: true }).click();
  await expect(recovery(other)).toHaveCount(0);
  await expect(other.getByText("Deposited 40 Gold Coins.", { exact: true })).toBeVisible();
  expect(await other.evaluate(key => localStorage.getItem(key), key)).toBeNull();
  expect((await own.api.rpc("get_game_state")).data).toMatchObject({ gold_coins: 960, bank_gold_coins: 40 });
  await other.close();
});
