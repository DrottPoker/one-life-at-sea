import { isLocalTestApi, localDatabaseContainer } from "../support/local";
import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";

process.loadEnvFile(".env.local");
const databaseUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
if (!isLocalTestApi(databaseUrl.href)) {
  throw new Error("Navigation tests require this project's local Supabase.");
}

test("game navigation preserves the shell, prefetches and only loads content", async ({ page }) => {
  const suffix = [...randomBytes(10)].map(value => String.fromCharCode(97 + value % 26)).join("");
  const email = `navigation-${suffix}@example.test`;
  const password = randomBytes(24).toString("hex");
  const errors: string[] = [];
  const prefetched = new Set<string>();
  const documents: string[] = [];
  let blockedPath: string | null = null;
  let release: (() => void) | undefined;
  let responseGate = Promise.resolve();
  let heldRequests = 0;
  page.on("pageerror", error => errors.push(error.name));
  page.on("response", response => {
    const headers = response.request().headers();
    if (response.ok() && headers["next-router-prefetch"] === "1" &&
        !headers["next-router-segment-prefetch"]) {
      prefetched.add(new URL(response.url()).pathname);
    }
  });
  await page.route("**/*", async route => {
    const request = route.request();
    if (new URL(request.url()).pathname === blockedPath &&
        request.headers().rsc === "1" &&
        request.headers()["next-router-prefetch"] !== "1") {
      heldRequests++;
      await responseGate;
    }
    await route.continue();
  });

  try {
    await page.goto("/register");
    await page.getByLabel("Character name", { exact: true }).fill(`Navigator ${suffix}`);
    await page.getByLabel("Email address", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByLabel("Confirm password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    await expect(page).toHaveURL(/\/harbor$/);
    const navigation = page.getByRole("navigation", { name: "Harbor locations" });
    const sidebar = page.getByRole("complementary", { name: "Character and harbor navigation" });
    const energy = page.getByRole("progressbar", { name: "Energy", exact: true });
    await expect(energy).toHaveAttribute("aria-valuenow", "100");
    await expect.poll(() => prefetched.has("/harbor/crew-training")).toBe(true);
    const originalSidebar = (await sidebar.elementHandle())!;
    const originalEnergy = (await energy.elementHandle())!;
    page.on("request", request => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
        documents.push(new URL(request.url()).pathname);
      }
    });

    blockedPath = "/harbor/crew-training";
    responseGate = new Promise(resolve => { release = resolve; });
    await navigation.getByRole("link", { name: "Crew Training", exact: true }).click();
    await expect.poll(() => heldRequests).toBeGreaterThan(0);
    const loader = page.getByRole("status", { name: "Loading view" });
    const pending = page.getByRole("main").getByRole("status", { name: "Loading view" });
    await expect(pending).toBeVisible({ timeout: 1_000 });
    await expect(navigation.getByRole("link", { name: "Crew Training", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(navigation.locator(".o-spinner")).toHaveCount(0);
    await expect(navigation.getByRole("link", { name: "Crew Training", exact: true }).locator("svg")).toBeVisible();
    await expect(page.getByRole("main").getByRole("heading", { name: "The Harbor", exact: true })).toBeHidden();
    await expect(sidebar).toBeVisible();
    await expect(energy).toHaveAttribute("aria-valuenow", "100");
    expect(await originalSidebar.evaluate(element => element.isConnected)).toBe(true);
    expect(await originalEnergy.evaluate(element => element.isConnected)).toBe(true);
    await expect(page.getByText("Finding your berth...", { exact: true })).toHaveCount(0);
    await page.screenshot({ path: ".local/navigation-loading-desktop.jpg", type: "jpeg", quality: 75, fullPage: true });
    await page.setViewportSize({ width: 375, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(pending).toBeVisible();
    await page.screenshot({ path: ".local/navigation-loading-mobile.jpg", type: "jpeg", quality: 75, fullPage: true });
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(await pending.locator(".o-spinner").evaluate(element => getComputedStyle(element).animationName)).toBe("none");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.setViewportSize({ width: 1280, height: 900 });

    // Background reconciliation must not override the next navigation.
    const beforeFocus = heldRequests;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.waitForTimeout(250);
    expect(heldRequests).toBe(beforeFocus);
    // A second choice must work even while the first response is held.
    await navigation.getByRole("link", { name: "Marketplace", exact: true }).click();
    await expect(page).toHaveURL(/\/harbor\/marketplace$/);
    await expect(page.getByRole("heading", { name: "Marketplace", exact: true })).toBeVisible();
    blockedPath = null;
    release?.();
    await expect(loader).toHaveCount(0);
    expect(await originalSidebar.evaluate(element => element.isConnected)).toBe(true);

    await navigation.getByRole("link", { name: "Crew Training", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Crew Training", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Train Attack for 5 Energy", exact: true }).click();
    await expect(page.getByLabel("Attack stat", { exact: true })).toHaveText(/^1[12]$/);
    const trainedAttack = (await page.getByLabel("Attack stat", { exact: true }).textContent())!;
    await expect(energy).toHaveAttribute("aria-valuenow", "95");
    expect(await originalEnergy.evaluate(element => element.isConnected)).toBe(true);
    await navigation.getByRole("link", { name: "Ship Upgrades", exact: true }).click();
    await expect(page).toHaveURL(/\/harbor\/ship-upgrades$/);
    await expect(page.getByRole("heading", { name: "Ship Upgrades", exact: true })).toBeVisible();
    await expect(energy).toHaveAttribute("aria-valuenow", "95");
    await page.goBack();
    await expect(page).toHaveURL(/\/harbor\/crew-training$/);
    await expect(page.getByLabel("Attack stat", { exact: true })).toHaveText(trainedAttack);
    await page.goForward();
    await expect(page).toHaveURL(/\/harbor\/ship-upgrades$/);
    await expect(page.getByRole("heading", { name: "Ship Upgrades", exact: true })).toBeVisible();
    expect(await originalSidebar.evaluate(element => element.isConnected)).toBe(true);
    expect(await originalEnergy.evaluate(element => element.isConnected)).toBe(true);
    expect(documents).toEqual([]);

    // Direct deep links still load the correct authenticated view.
    await page.goto("/harbor/crew-training");
    await expect(page.getByRole("heading", { name: "Crew Training", exact: true })).toBeVisible();
    await expect(page.getByLabel("Attack stat", { exact: true })).toHaveText(trainedAttack);
    await expect(energy).toHaveAttribute("aria-valuenow", "95");
    await page.getByRole("button", { name: "Log out", exact: true }).filter({ visible: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect(errors).toEqual([]);
  } finally {
    blockedPath = null;
    release?.();
    await page.unrouteAll({ behavior: "wait" });
    execFileSync("docker", ["exec", localDatabaseContainer, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c",
      `delete from auth.users where email='${email}'`], { stdio: ["ignore", "pipe", "pipe"] });
  }
});
