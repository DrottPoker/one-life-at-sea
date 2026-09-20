import { expect, test } from "@playwright/test";
import { cleanupTestAccounts, createTestAccount, loginTestAccount } from "../support/accounts";

test("cold navigation updates content immediately and preserves normal link behavior", async ({ page, context }) => {
  const account = await createTestAccount("navigation-cold");
  let blockedPath: string | null = "/harbor/bank";
  let release: (() => void) | undefined;
  let gate = new Promise<void>(resolve => { release = resolve; });
  let heldNavigations = 0;
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", async route => {
    const request = route.request();
    if (new URL(request.url()).pathname === blockedPath && request.headers().rsc === "1") {
      if (request.headers()["next-router-prefetch"] !== "1") heldNavigations++;
      await gate;
    }
    await route.continue();
  });
  try {
    await loginTestAccount(page, account);
    const navigation = page.getByRole("navigation", { name: "Harbor locations" });
    const main = page.getByRole("main");
    const bank = navigation.getByRole("link", { name: "Bank", exact: true });
    await bank.click();
    await expect(main.getByRole("status", { name: "Loading view" })).toBeVisible({ timeout: 1_000 });
    await expect(bank).toHaveAttribute("aria-current", "page");
    await expect(main.getByRole("heading", { name: "The Harbor", exact: true })).toBeHidden();
    await expect(navigation.locator(".o-spinner")).toHaveCount(0);
    await expect.poll(() => heldNavigations).toBeGreaterThan(0);

    // Keyboard navigation can replace a pending, completely unprefetched route.
    await navigation.getByRole("link", { name: "Inventory", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(main.getByRole("heading", { name: "Inventory", exact: true })).toBeVisible();
    blockedPath = null;
    release?.();
    await expect(page).toHaveURL(/\/inventory$/);

    // Modified clicks open a new tab without hiding the current page.
    const newPage = context.waitForEvent("page");
    await page.getByRole("link", { name: "My Profile", exact: true }).click({ modifiers: ["Control"] });
    const profileTab = await newPage;
    await expect(profileTab).toHaveURL(new RegExp("/characters/" + account.id + "$"));
    await expect(main.getByRole("heading", { name: "Inventory", exact: true })).toBeVisible();
    await expect(main.getByRole("status", { name: "Loading view" })).toHaveCount(0);
    await profileTab.close();
    await page.bringToFront();

    // Content feedback also covers profile links outside the harbor menu.
    blockedPath = "/characters/" + account.id;
    gate = new Promise<void>(resolve => { release = resolve; });
    await page.getByRole("link", { name: "My Profile", exact: true }).click();
    await expect(main.getByRole("status", { name: "Loading view" })).toBeVisible({ timeout: 1_000 });
    await expect(main.getByRole("heading", { name: "Inventory", exact: true })).toBeHidden();
    blockedPath = null;
    release?.();
    await expect(page).toHaveURL(new RegExp("/characters/" + account.id + "$"));
    await expect(main.getByRole("status", { name: "Loading view" })).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    blockedPath = null;
    release?.();
    await page.unrouteAll({ behavior: "wait" });
    await cleanupTestAccounts([account]);
  }
});
