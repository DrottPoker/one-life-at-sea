import { test, expect } from "@playwright/test";
import { createTestAccount, cleanupTestAccounts, loginTestAccount, testSql } from "../support/accounts";

test("captains choose a portrait from the gallery and others see it live", async ({ page, browser }) => {
  const owner = await createTestAccount("portrait-owner"), viewer = await createTestAccount("portrait-viewer");
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const viewerContext = await browser.newContext(), viewerPage = await viewerContext.newPage();
  try {
    await loginTestAccount(page, owner);
    await page.getByRole("link", { name: "My Profile", exact: true }).click();
    const main = page.getByRole("main"), sidebar = page.getByRole("complementary", { name: "Character and harbor navigation" });
    const hero = main.locator(".o-profile-portrait > .o-portrait-art img"), sidebarPortrait = sidebar.locator(".o-captain-portrait img");
    await expect(hero).toHaveAttribute("src", /harbor-rover/);
    await expect(sidebarPortrait).toHaveAttribute("src", /harbor-rover/);

    await loginTestAccount(viewerPage, viewer);
    await viewerPage.goto("/players/" + owner.playerNumber);
    const viewerHero = viewerPage.getByRole("main").locator(".o-profile-portrait > .o-portrait-art img");
    await expect(viewerHero).toHaveAttribute("src", /harbor-rover/);
    await expect(viewerPage.getByRole("button", { name: "Change portrait" })).toHaveCount(0);

    // Escape closes the gallery without saving and returns focus to the button.
    const change = main.getByRole("button", { name: "Change portrait", exact: true });
    await change.click();
    const dialog = page.getByRole("dialog", { name: "Choose your portrait" });
    await expect(dialog.getByRole("radio")).toHaveCount(3);
    await expect(dialog.getByRole("radio", { name: /^Harbor Rover/ })).toBeChecked();
    await expect(dialog.getByRole("button", { name: "Save portrait", exact: true })).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(change).toBeFocused();

    await change.click();
    await dialog.getByText("Old Salt", { exact: true }).click();
    await expect(dialog.getByRole("radio", { name: "Old Salt", exact: true })).toBeChecked();
    for (const width of [375, 320]) {
      await page.setViewportSize({ width, height: 800 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.screenshot({ path: ".local/portrait-gallery-mobile.png" });
    await page.setViewportSize({ width: 1280, height: 900 });
    await dialog.getByRole("button", { name: "Save portrait", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("status").filter({ hasText: "Portrait saved." })).toHaveCount(1);
    await expect(hero).toHaveAttribute("src", /old-salt/);
    await expect(sidebarPortrait).toHaveAttribute("src", /old-salt/);
    expect(testSql("select portrait_id from public.characters where id='" + owner.id + "'").trim()).toBe("old_salt");
    // The other captain's open profile follows the change without a reload.
    await expect(viewerHero).toHaveAttribute("src", /old-salt/, { timeout: 20000 });

    await change.click();
    await expect(dialog.getByRole("radio", { name: /^Old Salt/ })).toBeChecked();
    await expect(dialog.getByText("Current", { exact: true })).toHaveCount(1);
    await dialog.getByText("Red Corsair", { exact: true }).click();
    await dialog.getByRole("button", { name: "Save portrait", exact: true }).click();
    await expect(hero).toHaveAttribute("src", /red-corsair/);
    await page.reload();
    await expect(hero).toHaveAttribute("src", /red-corsair/);
    await expect(sidebarPortrait).toHaveAttribute("src", /red-corsair/);
    await page.screenshot({ path: ".local/portrait-profile.png" });
    expect(errors).toEqual([]);
  } finally {
    await viewerContext.close();
    await cleanupTestAccounts([owner, viewer]);
  }
});
