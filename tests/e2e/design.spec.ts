import { test, expect } from "@playwright/test";
import { createTestAccount, loginTestAccount, cleanupTestAccounts } from "../support/accounts";

test("nautical frame keeps scenery fixed and game views usable across screen sizes", async ({ page }) => {
  test.setTimeout(90_000);
  const account = await createTestAccount("design", { character_name: "Captain Silverwave" });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    await page.setViewportSize({ width: 1680, height: 940 });
    await loginTestAccount(page, account);
    const hero = page.locator(".o-harbor-welcome .o-art");
    await expect(hero).toBeVisible();
    await hero.evaluate(image => (image as HTMLImageElement).decode());
    const scenery = await page.request.get("/images/harbor-background.webp");
    expect(scenery.ok()).toBe(true);
    expect(scenery.headers()["content-type"]).toContain("image/webp");

    const background = () => page.evaluate(() => {
      const style = getComputedStyle(document.body, "::before");
      return { position: style.position, image: style.backgroundImage, top: style.top };
    });
    const initial = await background();
    expect(initial.position).toBe("fixed");
    expect(initial.image).toContain("/images/harbor-background.webp");
    expect((await hero.boundingBox())!.height).toBeLessThanOrEqual(190);
    const shell = await page.locator(".game-shell").boundingBox();
    expect(shell!.x).toBeGreaterThan(100);
    expect(shell!.width).toBeLessThanOrEqual(1240);
    await page.screenshot({ path: ".local/design-harbor-desktop.jpg", type: "jpeg", quality: 85, fullPage: true });

    // A shorter viewport makes the page scroll without moving its backdrop.
    await page.setViewportSize({ width: 1440, height: 650 });
    const heroTop = (await hero.boundingBox())!.y;
    await page.evaluate(() => window.scrollTo(0, 220));
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    expect((await hero.boundingBox())!.y).toBeLessThan(heroTop);
    expect(await background()).toEqual(initial);
    expect(await page.locator(".o-workspace").evaluate(element => getComputedStyle(element).overflowY)).toBe("visible");

    for (const width of [1280, 1024, 900, 768, 600, 375, 320]) {
      await page.setViewportSize({ width, height: 940 });
      await page.evaluate(() => window.scrollTo(0, 0));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Harbor overflow at " + width).toBe(true);
      await expect(page.getByRole("progressbar", { name: "Energy", exact: true })).toBeVisible();
      const nav = page.getByRole("navigation", { name: "Harbor locations" });
      await expect(nav.getByRole("link", { name: "Marketplace", exact: true })).toBeVisible();
      if (width === 375) {
        await page.screenshot({ path: ".local/design-harbor-mobile.jpg", type: "jpeg", quality: 85, fullPage: true });
      }
    }

    for (const [path, heading] of [
      ["/inventory", "Inventory"],
      ["/harbor/marketplace", "Marketplace"],
      ["/harbor/crew-training", "Crew Training"],
      ["/harbor/ship-upgrades", "Ship Upgrades"],
    ]) {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.getByRole("navigation", { name: "Harbor locations" }).getByRole("link", { name: heading, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(path + "$"));
      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
      for (const width of [1440, 768, 375, 320]) {
        await page.setViewportSize({ width, height: 1000 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), heading + " overflow at " + width).toBe(true);
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.screenshot({ path: ".local/design-" + path.split("/").at(-1) + "-desktop.jpg", type: "jpeg", quality: 80, fullPage: true });
    }
    expect(errors).toEqual([]);
  } finally {
    await cleanupTestAccounts([account]);
  }
});
