import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import type { Database } from "../../src/lib/database.types";
import { isLocalTestApi, localDatabaseContainer } from "../support/local";

process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
if (!isLocalTestApi(url)) throw new Error("Bank tests require local Supabase.");
const client = () => createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function account() {
  const api = client();
  const suffix = randomBytes(10).toString("hex");
  const email = "bank-" + suffix + "@example.test";
  const password = randomBytes(24).toString("hex");
  const signup = await api.auth.signUp({ email, password, options: { data: { character_name: "Bank " + suffix } } });
  expect(signup.error).toBeNull();
  const own = await api.from("characters").select("id").single();
  expect(own.error).toBeNull();
  const id = own.data!.id;
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("Invalid test captain ID.");
  return { api, id, email, password };
}
function seedCoins(id: string, amount: number) {
  if (!/^[0-9a-f-]{36}$/.test(id) || !Number.isSafeInteger(amount)) throw new Error("Invalid fixture.");
  execFileSync("docker", ["exec", localDatabaseContainer, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1",
    "-c", "update public.characters set gold_coins=" + amount + ",bank_gold_coins=0 where id='" + id + "'"], { stdio: ["ignore", "pipe", "pipe"] });
}

test("bank transfers persist, update both tabs and fit the sidebar and mobile", async ({ page, context }) => {
  const own = await account();
  expect((await own.api.rpc("get_game_state")).data).toMatchObject({ gold_coins: 0, bank_gold_coins: 0 });
  seedCoins(own.id, 1000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.name));
  await page.goto("/login");
  await page.getByLabel("Email address", { exact: true }).fill(own.email);
  await page.getByLabel("Password", { exact: true }).fill(own.password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/harbor$/);
  const carried = page.getByLabel("Gold Coins on character", { exact: true });
  await expect(carried).toHaveText("1,000");
  await page.getByRole("navigation", { name: "Harbor locations" }).getByRole("link", { name: "Bank", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Bank", exact: true })).toBeVisible();
  const otherTab = await context.newPage();
  await otherTab.goto("/harbor/bank");
  await expect(otherTab.getByLabel("Bank balance", { exact: true })).toHaveText("0");
  await page.getByLabel("Amount", { exact: true }).fill("350");
  await page.getByRole("button", { name: "Deposit", exact: true }).click();
  await expect(page.getByText("Deposited 350 Gold Coins.", { exact: true })).toBeVisible();
  await expect(carried).toHaveText("650");
  await expect(page.getByLabel("Bank balance", { exact: true })).toHaveText("350");
  await expect(otherTab.getByLabel("Bank balance", { exact: true })).toHaveText("350");
  await expect(otherTab.getByLabel("Gold Coins on character", { exact: true })).toHaveText("650");

  await page.getByLabel("Amount", { exact: true }).fill("351");
  await expect(page.getByRole("button", { name: "Withdraw", exact: true })).toBeDisabled();
  await page.getByLabel("Amount", { exact: true }).fill("0");
  await expect(page.getByRole("button", { name: "Deposit", exact: true })).toBeDisabled();
  await page.getByLabel("Amount", { exact: true }).fill("1.5");
  await expect(page.getByRole("button", { name: "Deposit", exact: true })).toBeDisabled();
  await page.getByLabel("Amount", { exact: true }).fill("125");
  await page.getByRole("button", { name: "Withdraw", exact: true }).click();
  await expect(page.getByText("Withdrew 125 Gold Coins.", { exact: true })).toBeVisible();
  await expect(carried).toHaveText("775");
  await expect(page.getByLabel("Bank balance", { exact: true })).toHaveText("225");
  await page.reload();
  await expect(carried).toHaveText("775");
  for (const width of [1280, 768, 375, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const goldBox = await carried.boundingBox();
    const energyBox = await page.getByRole("progressbar", { name: "Energy", exact: true }).boundingBox();
    expect(goldBox!.y + goldBox!.height).toBeLessThan(energyBox!.y);
  }
  await page.setViewportSize({ width: 1280, height: 960 });
  await page.screenshot({ path: ".local/bank-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 375, height: 1000 });
  await page.screenshot({ path: ".local/bank-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Log out", exact: true }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Email address", { exact: true }).fill(own.email);
  await page.getByLabel("Password", { exact: true }).fill(own.password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/harbor$/);
  await page.goto("/harbor/bank");
  await expect(carried).toHaveText("775");
  await expect(page.getByLabel("Bank balance", { exact: true })).toHaveText("225");
  await page.getByLabel("Amount", { exact: true }).fill("225");
  await page.getByRole("button", { name: "Withdraw", exact: true }).click();
  await expect(page.getByLabel("Bank balance", { exact: true })).toHaveText("0");
  await expect(carried).toHaveText("1,000");
  expect(errors).toEqual([]);
  await otherTab.close();
  await own.api.auth.signOut();
});

test("concurrent transfers cannot overspend, duplicate or access other coins", async () => {
  const own = await account();
  const other = await account();
  seedCoins(own.id, 1000);
  const id = randomUUID();
  const repeated = await Promise.all(Array.from({ length: 12 }, () => own.api.rpc("transfer_gold", { direction: "deposit", amount: 400, request_id: id })));
  expect(repeated.every(result => !result.error)).toBe(true);
  expect((await own.api.rpc("get_game_state")).data).toMatchObject({ gold_coins: 600, bank_gold_coins: 400 });
  const attempts = await Promise.all(Array.from({ length: 10 }, () => own.api.rpc("transfer_gold", { direction: "deposit", amount: 100, request_id: randomUUID() })));
  expect(attempts.filter(result => !result.error)).toHaveLength(6);
  expect(attempts.filter(result => result.error?.message === "NOT_ENOUGH_GOLD")).toHaveLength(4);
  expect((await own.api.rpc("get_game_state")).data).toMatchObject({ gold_coins: 0, bank_gold_coins: 1000 });
  const withdrawals = await Promise.all(Array.from({ length: 15 }, () => own.api.rpc("transfer_gold", { direction: "withdraw", amount: 100, request_id: randomUUID() })));
  expect(withdrawals.filter(result => !result.error)).toHaveLength(10);
  expect(withdrawals.filter(result => result.error?.message === "NOT_ENOUGH_BANK_GOLD")).toHaveLength(5);
  expect((await own.api.rpc("get_game_state")).data).toMatchObject({ gold_coins: 1000, bank_gold_coins: 0 });
  expect((await own.api.rpc("transfer_gold", { direction: "withdraw", amount: 400, request_id: id })).error?.message).toBe("REQUEST_CONFLICT");
  expect((await other.api.rpc("transfer_gold", { direction: "deposit", amount: 400, request_id: id })).error?.message).toBe("NOT_ENOUGH_GOLD");
  expect((await other.api.from("characters").select("gold_coins,bank_gold_coins").eq("id", own.id)).data).toEqual([]);
  expect((await other.api.rpc("get_game_state")).data).toMatchObject({ gold_coins: 0, bank_gold_coins: 0 });
  expect((await client().rpc("transfer_gold", { direction: "deposit", amount: 1, request_id: randomUUID() })).error?.code).toBe("42501");
  await own.api.auth.signOut();
  await other.api.auth.signOut();
});

test("retry after a lost response reuses the transfer without charging twice", async ({ page }) => {
  const own = await account();
  seedCoins(own.id, 100);
  await page.goto("/login");
  await page.getByLabel("Email address", { exact: true }).fill(own.email);
  await page.getByLabel("Password", { exact: true }).fill(own.password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/harbor$/);
  await page.goto("/harbor/bank");
  let lostResponse = false;
  await page.route("**/harbor/bank", async route => {
    if (!lostResponse && route.request().method() === "POST" && route.request().headers()["next-action"]) {
      lostResponse = true;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await page.getByLabel("Amount", { exact: true }).fill("40");
  await page.getByRole("button", { name: "Deposit", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry transfer", exact: true })).toBeVisible();
  expect(lostResponse).toBe(true);
  await expect.poll(async () => (await own.api.rpc("get_game_state")).data?.bank_gold_coins).toBe(40);
  await page.getByRole("button", { name: "Retry transfer", exact: true }).click();
  await expect(page.getByText("Deposited 40 Gold Coins.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Gold Coins on character", { exact: true })).toHaveText("60");
  await expect(page.getByLabel("Bank balance", { exact: true })).toHaveText("40");
  await own.api.auth.signOut();
});

