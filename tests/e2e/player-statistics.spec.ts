import { test, expect } from "@playwright/test";
import { createTestAccount, cleanupTestAccounts, loginTestAccount, testSql } from "../support/accounts";

test("admin player statistics count unique active accounts and preserve directory tools", async ({ page }) => {
  const admin = await createTestAccount("player-stats-admin"), player = await createTestAccount("player-stats-player");
  testSql("insert into private.admin_members(user_id) values('" + admin.userId + "')");
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    const before = await admin.api.rpc("admin_player_statistics");
    expect(before.error).toBeNull();
    expect((await player.api.rpc("admin_player_statistics")).error?.message).toBe("ADMIN_REQUIRED");
    const activeDays = () => testSql("select count(*) from private.player_activity_daily d join private.player_statistics_accounts a on a.id=d.account_id where a.user_id='" + player.userId + "'").trim();
    expect(activeDays()).toBe("1");
    expect((await player.api.auth.refreshSession()).error).toBeNull();
    expect((await player.api.auth.signInWithPassword({ email: player.email, password: player.password })).error).toBeNull();
    expect(activeDays()).toBe("1");
    expect((await player.api.rpc("record_player_activity")).error).toBeNull();
    expect(activeDays()).toBe("1");
    const directory = await admin.api.rpc("admin_players", { search_term: player.name });
    expect(directory.error).toBeNull();
    expect(directory.data!.rows[0].last_active_at).not.toBeNull();
    await loginTestAccount(page, admin);
    // Continuing sessions update activity without another login.
    testSql("update private.player_statistics_accounts set last_active_at=statement_timestamp()-interval '2 days' where user_id='" + admin.userId + "'");
    await page.reload();
    await expect.poll(() => testSql("select last_active_at>statement_timestamp()-interval '1 minute' from private.player_statistics_accounts where user_id='" + admin.userId + "'").trim()).toBe("t");
    await page.goto("/admin/players");
    const stats = page.getByRole("region", { name: "Player statistics", exact: true });
    await expect(stats.getByRole("heading", { name: "Players", exact: true })).toBeVisible();
    await expect(stats.getByRole("slider")).toHaveCount(3);
    for (const period of ["12 months", "All time", "Last month"]) {
      await stats.getByRole("button", { name: period, exact: true }).click();
      await expect(stats.getByRole("button", { name: "Refresh statistics", exact: true })).toBeEnabled();
      await expect(stats.getByText("Showing " + period.toLowerCase(), { exact: false })).toBeVisible();
    }
    await expect(stats.getByText("Successful sign-ins per day", { exact: true })).toHaveCount(0);
    await expect(stats.getByText("Active players · 24 hours", { exact: true })).toBeVisible();
    const plot = stats.getByRole("slider", { name: "Unique active players per day timeline" });
    await plot.focus(); await page.keyboard.press("Home");
    await expect(plot).toHaveAttribute("aria-valuetext", /Not tracked/);
    await page.keyboard.press("End"); await expect(plot).not.toHaveAttribute("aria-valuetext", /Not tracked/);
    await page.route("**/rest/v1/rpc/admin_player_statistics", route => route.abort());
    await stats.getByRole("button", { name: "Refresh statistics", exact: true }).click();
    await expect(stats.getByRole("status")).toContainText("last successful update");
    await expect(stats.getByRole("slider")).toHaveCount(3);
    await page.unroute("**/rest/v1/rpc/admin_player_statistics");
    await stats.getByRole("button", { name: "Refresh statistics", exact: true }).click();
    await expect(stats.getByRole("status")).not.toContainText("last successful update");
    const list = page.getByRole("region", { name: "Player directory", exact: true });
    await list.getByLabel("Search players").fill(player.name);
    await list.getByRole("combobox", { name: "Last active", exact: true }).selectOption("24h", { timeout: 10000 });
    await list.getByRole("combobox", { name: "Sort players", exact: true }).selectOption("last_active", { timeout: 10000 });
    await list.getByRole("button", { name: "Search", exact: true }).click();
    await expect(list.getByRole("row")).toHaveCount(2);
    await expect(list.getByRole("link", { name: player.name, exact: true })).toBeVisible();
    for (const width of [1440, 768, 375, 320]) {
      await page.setViewportSize({ width, height: 1050 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "No overflow at " + width).toBe(true);
      if ([1440, 375].includes(width)) await page.screenshot({ path: ".local/player-statistics-" + width + ".png", fullPage: true });
    }
    await list.getByRole("link", { name: player.name, exact: true }).click();
    await expect(page.getByRole("button", { name: "Edit character", exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  } finally { await cleanupTestAccounts([admin, player]); }
});
