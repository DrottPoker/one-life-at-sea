import { test, expect } from "@playwright/test";
import { createTestAccount, cleanupTestAccounts, loginTestAccount, testSql } from "../support/accounts";

test("Stamina renders its capacity, tooltip and recovered balance across live updates", async ({ page }) => {
  const own = await createTestAccount("stamina");
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    await loginTestAccount(page, own);
    const bar = page.getByRole("progressbar", { name: "Stamina", exact: true });
    await expect(bar).toHaveAttribute("aria-valuemax", "50");
    await expect(bar).toHaveAttribute("aria-valuenow", "50");
    await bar.hover();
    await expect(page.getByRole("tooltip")).toHaveText("Increases by 1 every 5 minutes. Used for skill activities. Recovery paused at 50. Storage limit: 200.");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    testSql("update public.characters set stamina=2,stamina_updated_at=clock_timestamp()+interval '1 day' where id='" + own.id + "'; select private.notify_training('" + own.id + "');");
    await expect(bar).toHaveAttribute("aria-valuenow", "2");
    const state = (await own.api.rpc("get_game_state")).data!;
    expect(Date.parse(state.stamina_next_at!) % 300_000).toBe(0);
    await page.goto("/harbor/crew-training");
    await page.getByRole("button", { name: "Train Attack for 5 Energy", exact: true }).click();
    await expect(page.getByRole("progressbar", { name: "Energy", exact: true })).toHaveAttribute("aria-valuenow", "95");
    await expect(bar).toHaveAttribute("aria-valuenow", "2");
    for (const width of [1440, 375, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await bar.focus();
      const hint = page.getByRole("tooltip");
      await expect(hint).toBeVisible();
      const bounds = (await hint.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (width !== 320) await page.screenshot({ path: ".local/stamina-" + width + ".png" });
      await page.keyboard.press("Escape");
      await page.keyboard.press("Tab");
    }
    testSql("update public.characters set stamina_updated_at=clock_timestamp()-interval '1 day' where id='" + own.id + "'; select private.notify_training('" + own.id + "');");
    await expect(bar).toHaveAttribute("aria-valuenow", "50");
    expect((await own.api.rpc("get_game_state")).data!.stamina_next_at).toBeNull();
    expect(errors).toEqual([]);
  } finally {
    await cleanupTestAccounts([own]);
  }
});
