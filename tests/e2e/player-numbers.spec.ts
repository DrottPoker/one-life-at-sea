import { test, expect } from "@playwright/test";
import { createTestAccount, createTestClient, cleanupTestAccounts, loginTestAccount, testSql } from "../support/accounts";

test("players are searchable by name or public number and old links retain their destination", async ({ page }) => {
  const own = await createTestAccount("number-owner"), other = await createTestAccount("number-other");
  try {
    expect(own.playerNumber).toBeGreaterThanOrEqual(100001);
    expect(other.playerNumber).toBeGreaterThan(own.playerNumber);
    await loginTestAccount(page, own);
    await page.getByRole("link", { name: "Players", exact: true }).click();
    await expect(page).toHaveURL(/\/players$/);
    const input = page.getByRole("textbox", { name: "Find a player" });
    const results = page.getByRole("list", { name: "Player search results" });
    await input.fill(other.name.toUpperCase());
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(results.getByRole("link", { name: other.name, exact: true })).toHaveAttribute("href", "/players/" + other.playerNumber);
    await expect(results.getByText("[" + other.playerNumber + "]", { exact: true })).toBeVisible();

    await input.fill(String(other.playerNumber));
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(results.getByRole("link")).toHaveCount(1);
    await expect(results.getByRole("link", { name: other.name, exact: true })).toBeVisible();
    await input.fill("#" + other.playerNumber);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(results.getByRole("link")).toHaveCount(1);
    await results.getByRole("link", { name: other.name, exact: true }).click();
    await expect(page).toHaveURL("/players/" + other.playerNumber);
    await expect(page.getByRole("status", { name: "Player ID", exact: true })).toHaveText(String(other.playerNumber));
    await expect(page.getByRole("link", { name: "Attack", exact: true })).toHaveAttribute("href", "/attack/" + other.playerNumber);

    await page.goto("/characters/" + other.id);
    await expect(page).toHaveURL("/players/" + other.playerNumber);
    await page.goto("/attack/" + other.id);
    await expect(page).toHaveURL("/attack/" + other.playerNumber);
    await expect(page.getByRole("button", { name: /Start battle/ })).toBeVisible();

    const renamed = other.name + "Renamed";
    testSql("update public.characters set display_name='" + renamed + "' where id='" + other.id + "'");
    await page.goto("/players/" + other.playerNumber);
    await expect(page.getByRole("heading", { name: renamed, exact: true })).toBeVisible();
    await expect(page.getByRole("status", { name: "Player ID", exact: true })).toHaveText(String(other.playerNumber));
    await page.goto("/players?q=" + encodeURIComponent("#" + other.playerNumber));
    await expect(results.getByRole("link", { name: renamed, exact: true })).toBeVisible();

    for (const width of [1280, 375, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.screenshot({ path: ".local/players-mobile.png", fullPage: true });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: ".local/players-desktop.png", fullPage: true });
    await page.goto("/players?q=%23missing");
    await expect(results.getByText("No players match your search.")).toBeVisible();
    for (const id of ["100000", "0100001", "9007199254740992", "9007199254740991"]) {
      await page.goto("/players/" + id);
      await expect(page.getByRole("heading", { name: "Character not found", exact: true })).toBeVisible();
    }
  } finally { await cleanupTestAccounts([own, other]); }
});

test("parallel registrations receive unique immutable public numbers and keep private rows private", async () => {
  const results = await Promise.allSettled(Array.from({ length: 6 }, () => createTestAccount("number-parallel")));
  const accounts = results.flatMap(result => result.status === "fulfilled" ? [result.value] : []);
  try {
    expect(accounts).toHaveLength(6);
    expect(new Set(accounts.map(account => account.playerNumber)).size).toBe(6);
    const [own, other] = accounts;
    const search = await own.api.rpc("search_players", { search_term: "#" + other.playerNumber });
    expect(search.error).toBeNull();
    expect(search.data?.players).toEqual([{ character_id: other.id, player_number: other.playerNumber, display_name: other.name }]);
    expect((await own.api.from("characters").select("*").eq("player_number", other.playerNumber)).data).toEqual([]);
    const publicProfile = await own.api.from("character_profiles").select("*").eq("player_number", other.playerNumber).single();
    expect(publicProfile.data).not.toHaveProperty("user_id");
    expect(publicProfile.data).not.toHaveProperty("gold_coins");
    expect((await createTestClient().rpc("search_players", { search_term: "#" + other.playerNumber })).error?.code).toBe("42501");
  } finally { await cleanupTestAccounts(accounts); }
});
