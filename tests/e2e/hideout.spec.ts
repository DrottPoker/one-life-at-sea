import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { cleanupTestAccounts, createTestAccount, loginTestAccount, testSql } from "../support/accounts";

test("hideout belongs to the signed-in captain and preserves navigation and resources", async ({ page }) => {
  const accounts: Awaited<ReturnType<typeof createTestAccount>>[] = [];
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    await page.goto("/hideout");
    await expect(page).toHaveURL(/\/login$/);
    const own = await createTestAccount("hideout-own"); accounts.push(own);
    const other = await createTestAccount("hideout-other"); accounts.push(other);
    testSql(`select private.award_skill_xp('${own.id}','cooking',200); select private.award_skill_xp('${other.id}','crafting',2495);`);
    await loginTestAccount(page, own);
    const sidebar = page.getByRole("complementary", { name: "Character and harbor navigation" });
    const originalSidebar = (await sidebar.elementHandle())!;
    const documents: string[] = [];
    page.on("request", request => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents.push(request.url()); });
    const nav = page.getByRole("navigation", { name: "Harbor locations" });
    await nav.getByRole("link", { name: "Hideout", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/hideout$/);
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { name: "Hideout", exact: true })).toBeVisible();
    await expect(main.getByRole("heading", { name: `Welcome home, ${own.name}.`, exact: true })).toBeVisible();
    await expect(main.getByLabel("Cooking level", { exact: true })).toHaveText("2");
    await expect(main.getByLabel("Cooking XP", { exact: true })).toHaveText("200");
    await expect(main.getByLabel("Crafting level", { exact: true })).toHaveText("1");
    await expect(main.getByLabel("Crafting XP", { exact: true })).toHaveText("0");
    await expect(main.getByText("Coming later", { exact: true })).toHaveCount(1);
    await expect(main.getByText("Hideout upgrades are coming later")).toBeVisible();
    await expect(nav.getByRole("link", { name: "Hideout", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(sidebar.getByRole("progressbar", { name: "Energy", exact: true })).toHaveAttribute("aria-valuenow", "100");
    expect(await originalSidebar.evaluate(element => element.isConnected)).toBe(true);
    await main.getByRole("link", { name: "View your inventory" }).click();
    await expect(page).toHaveURL(/\/inventory$/);
    await page.goBack();
    await expect(main.getByRole("heading", { name: "Hideout", exact: true })).toBeVisible();
    await main.getByRole("link", { name: "Gather supplies" }).click();
    await expect(page).toHaveURL(/\/activities$/);
    await nav.getByRole("link", { name: "The Harbor", exact: true }).click();
    await page.getByRole("region", { name: "Harbor directory" }).getByRole("link", { name: /Hideout/ }).click();
    await expect(main.getByRole("heading", { name: "Hideout", exact: true })).toBeVisible();
    expect(documents).toEqual([]);
    for (const width of [1440, 768, 375, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(main.getByRole("heading", { name: "Cooking", exact: true })).toBeVisible();
      await expect(main.getByRole("heading", { name: "Crafting", exact: true })).toBeVisible();
      if (width === 1440 || width === 375) await page.screenshot({ path: `.local/hideout-${width}.jpg`, type: "jpeg", quality: 75, fullPage: true });
    }
    await page.goto(`/hideout?character_id=${other.id}`);
    await expect(main.getByRole("heading", { name: `Welcome home, ${own.name}.`, exact: true })).toBeVisible();
    await expect(main.getByLabel("Crafting XP", { exact: true })).toHaveText("0");
    expect(errors).toEqual([]);
  } finally { await page.close(); await cleanupTestAccounts(accounts); }
});

test("hideout follows hospital and sea access restrictions", async ({ page }) => {
  const accounts: Awaited<ReturnType<typeof createTestAccount>>[] = [];
  try {
    const own = await createTestAccount("hideout-access"); accounts.push(own);
    await loginTestAccount(page, own);
    testSql(`update public.characters set crew_health=0 where id='${own.id}'`);
    await page.goto("/hideout");
    await expect(page).toHaveURL(/\/harbor\/hospital$/);
    const nav = page.getByRole("navigation", { name: "Harbor locations" });
    await expect(nav.getByRole("link", { name: "Hideout", exact: true })).toHaveCount(0);
    await expect(nav.locator('[aria-disabled="true"]').filter({ hasText: "Hideout" })).toBeVisible();
    testSql(`update public.characters set hospital_started_at=clock_timestamp()-interval '301 seconds',hospital_until=clock_timestamp()-interval '1 second' where id='${own.id}'`);
    await page.goto("/hideout");
    await expect(page.getByRole("heading", { name: "Hideout", exact: true })).toBeVisible();
    const state = await own.api.rpc("get_game_state");
    expect(state.error).toBeNull();
    const departure = await own.api.rpc("depart_harbor", { expected_version: state.data!.sea.version, request_id: randomUUID() });
    expect(departure.error).toBeNull();
    await page.goto("/hideout");
    await expect(page).toHaveURL(/\/sea$/);
    await expect(nav.getByRole("link", { name: "Hideout", exact: true })).toHaveCount(0);
    testSql(`update public.characters set travel_started_at=clock_timestamp()-interval '61 seconds',travel_arrives_at=clock_timestamp()-interval '1 second' where id='${own.id}'`);
    await own.api.rpc("get_game_state");
    await page.goto("/hideout");
    await expect(page).toHaveURL(/\/sea$/);
    await expect(nav.locator('[aria-disabled="true"]').filter({ hasText: "Hideout" })).toBeVisible();
  } finally { await page.close(); await cleanupTestAccounts(accounts); }
});
