import { test, expect } from "@playwright/test";
import { createTestAccount, cleanupTestAccounts, loginTestAccount, testSql } from "../support/accounts";

import { seedShipMaterials } from "../support/inventory";

test("admin overfills resources, bars stay bounded and ship work can spend the surplus", async ({ page }) => {
  const own = await createTestAccount("resource-overflow");
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    seedShipMaterials(own.id);
    testSql("insert into private.admin_members(user_id) values('" + own.userId + "');");
    await loginTestAccount(page, own);
    await page.goto("/admin/players/" + own.id);
    await page.getByRole("button", { name: "Edit character", exact: true }).click();
    const dialog = page.getByRole("dialog");
    const energy = dialog.getByLabel("energy", { exact: true });
    const stamina = dialog.getByLabel("stamina", { exact: true });
    await expect(energy).toHaveAttribute("max", "1000");
    await expect(stamina).toHaveAttribute("max", "200");
    await expect(stamina).toHaveAttribute("step", "1");
    await stamina.fill("201");
    expect(await stamina.evaluate((input: HTMLInputElement) => input.validity.rangeOverflow)).toBe(true);
    await energy.fill("1000");
    await stamina.fill("200");
    await dialog.getByLabel("Reason for change").fill("Verify resource storage limits");
    await dialog.getByRole("button", { name: "Review changes", exact: true }).click();
    await dialog.getByRole("button", { name: "Confirm change", exact: true }).click();
    await expect(dialog.getByRole("status")).toContainText("Changes saved.");
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    testSql("update public.characters set energy_updated_at=clock_timestamp()-interval '1 day',stamina_updated_at=clock_timestamp()-interval '1 day' where id='" + own.id + "';");
    await page.goto("/harbor/ship-upgrades");
    const energyBar = page.getByRole("progressbar", { name: "Energy", exact: true });
    const staminaBar = page.getByRole("progressbar", { name: "Stamina", exact: true });
    await expect(energyBar).toContainText("1000 / 100");
    await expect(staminaBar).toContainText("200 / 50");
    await expect(energyBar).toHaveAttribute("aria-valuenow", "1000");
    await expect(energyBar).toHaveAttribute("aria-valuemax", "1000");
    await expect(staminaBar).toHaveAttribute("aria-valuetext", "200, above recovery limit of 50");
    for (const bar of [energyBar, staminaBar]) {
      const widths = await bar.locator(".o-resource-track").evaluate(track => ({
        track: track.getBoundingClientRect().width, fill: track.firstElementChild!.getBoundingClientRect().width,
      }));
      expect(widths.fill).toBeGreaterThan(0);
      expect(widths.fill).toBeLessThanOrEqual(widths.track);
    }
    await energyBar.hover();
    await expect(page.getByRole("tooltip")).toContainText("Recovery paused at 100. Storage limit: 1000.");
    await page.keyboard.press("Escape");
    const workSize = page.getByRole("slider", { name: "Work size" });
    await expect(workSize).toHaveAttribute("max", "1000");
    await workSize.fill("1000");
    await expect(workSize).toHaveAttribute("aria-valuetext", "1000 Energy, 100 minutes");
    await page.setViewportSize({ width: 375, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: ".local/resource-overflow-mobile.png", fullPage: true });
    await page.getByRole("button", { name: "Start work", exact: true }).click();
    await expect(page.getByRole("region", { name: "Ship work in progress" })).toContainText("1000 Energy paid.");
    const state = (await own.api.rpc("get_game_state")).data!;
    expect(state.energy).toBeLessThanOrEqual(5);
    expect(state.stamina).toBe(200);
    expect(state.stamina_next_at).toBeNull();
    expect(state.training.ship_job?.energy_cost).toBe(1000);
    expect(errors).toEqual([]);
  } finally {
    await cleanupTestAccounts([own]);
  }
});
