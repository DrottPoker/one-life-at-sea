import { test, expect } from "@playwright/test";
import { createTestAccount, cleanupTestAccounts, loginTestAccount, testSql } from "../support/accounts";

test("fixed Energy deadlines show the current rate and recovered sea Energy can fund scouting", async ({ page }) => {
  const own = await createTestAccount("energy-clock");
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    await loginTestAccount(page, own);
    testSql("update public.characters set energy=0,energy_updated_at=" +
      "date_bin(interval '5 minutes',clock_timestamp(),'1970-01-01Z')-interval '1 second' where id='" + own.id + "';");
    await page.goto("/harbor/crew-training");
    await expect(page.getByText("Energy: +5 every 5 minutes on the server clock.", { exact: true })).toBeVisible();
    const energyBar = page.getByRole("progressbar", { name: "Energy", exact: true });
    const harborEnergy = Number(await energyBar.getAttribute("aria-valuenow"));
    expect(Number.isInteger(harborEnergy)).toBe(true);
    expect(harborEnergy).toBeGreaterThanOrEqual(5);
    const harborTick = await page.getByLabel("Next Energy tick", { exact: true }).getAttribute("datetime");
    expect(Date.parse(harborTick!) % 300_000).toBe(0);
    await expect(page.getByRole("button", { name: "Train Attack for 5 Energy", exact: true })).toBeEnabled();

    const before = await own.api.rpc("get_game_state");
    expect(before.error).toBeNull();
    expect((await own.api.rpc("depart_harbor", {
      expected_version: before.data!.sea.version, request_id: crypto.randomUUID(),
    })).error).toBeNull();
    await page.goto("/sea");
    await expect(page.getByText("Energy: +5 every 10 minutes on the server clock.", { exact: true })).toBeVisible();
    const travelingTick = await page.getByLabel("Next Energy tick", { exact: true }).getAttribute("datetime");
    expect(Date.parse(travelingTick!) % 600_000).toBe(0);

    testSql("update public.characters set energy=0,energy_updated_at=" +
      "date_bin(interval '10 minutes',clock_timestamp(),'1970-01-01Z')-interval '1 second'," +
      "travel_started_at=clock_timestamp()-interval '61 seconds',travel_arrives_at=clock_timestamp()-interval '1 second' where id='" + own.id + "';");
    await page.reload();
    const scout = page.getByRole("button", { name: "Scout nearby ships", exact: true });
    await expect(scout).toBeEnabled();
    const seaEnergy = Number(await energyBar.getAttribute("aria-valuenow"));
    expect(Number.isInteger(seaEnergy)).toBe(true);
    expect(seaEnergy).toBeGreaterThanOrEqual(5);
    await scout.click();
    await expect(page.getByRole("region", { name: "Nearby ships", exact: true })).toContainText("Scout again");
    const after = await own.api.rpc("get_game_state");
    expect(after.error).toBeNull();
    expect(Number.isInteger(after.data!.energy)).toBe(true);
    expect(after.data!.energy).toBeGreaterThanOrEqual(seaEnergy - 5);
    expect(after.data!.energy).toBeLessThanOrEqual(seaEnergy);
    expect(Date.parse(after.data!.energy_next_at!) % 600_000).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    await cleanupTestAccounts([own]);
  }
});
