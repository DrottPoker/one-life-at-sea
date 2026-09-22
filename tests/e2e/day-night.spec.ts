import { test, expect } from "@playwright/test";
import { worldTimeAt } from "../../src/lib/world-time";
import { createTestAccount, loginTestAccount, cleanupTestAccounts, testSql } from "../support/accounts";

test("world time is fresh, public and rendered into the initial HTML", async ({ request, browser, baseURL }) => {
  const first = await request.get("/api/world-time");
  expect(first.ok()).toBe(true);
  expect(first.headers()["cache-control"]).toContain("no-store");
  expect(first.headers()["set-cookie"]).toBeUndefined();
  const before = await first.json();
  expect(before).toEqual(worldTimeAt(Date.parse(before.observed_at)));
  expect(Object.keys(before).sort()).toEqual(["next_change_at", "observed_at", "period"]);
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false, timezoneId: "Pacific/Auckland" });
  try {
    const page = await context.newPage();
    await page.goto("/login");
    const after = await (await request.get("/api/world-time")).json();
    expect(Date.parse(after.observed_at)).toBeGreaterThanOrEqual(Date.parse(before.observed_at));
    expect([before.period, after.period]).toContain(await page.locator("body").getAttribute("data-day-period"));
  } finally { await context.close(); }
  expect((await request.post("/api/world-time")).status()).toBe(405);
  const image = await request.get("/images/harbor-background-night.webp");
  expect(image.ok()).toBe(true);
  expect(image.headers()["content-type"]).toContain("image/webp");
});

test("the backdrop crosses both boundaries without reload or trusting the device clock", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, timezoneId: "America/Los_Angeles", viewport: { width: 1680, height: 941 } });
  try {
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.clock.setFixedTime(new Date("2040-01-01T12:00:00Z"));
    let timestamp = Date.parse("2026-09-21T20:59:57Z"), unavailable = false;
    await page.route("**/api/world-time", route => unavailable ? route.abort() : route.fulfill({ json: worldTimeAt(timestamp) }));
    const initialSync = page.waitForResponse(response => new URL(response.url()).pathname === "/api/world-time" && response.ok());
    await page.goto("/login");
    await (await initialSync).finished();
    await expect(page.locator("body")).toHaveAttribute("data-day-period", "day");
    const background = () => page.evaluate(() => getComputedStyle(document.body, "::before").backgroundImage);
    expect(await background()).toContain("/images/harbor-background.webp");
    await page.screenshot({ path: ".local/day-night-day.jpg", type: "jpeg", quality: 85, fullPage: true });

    // Lost clock responses must not freeze the last visible period.
    unavailable = true;
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(page.locator("body")).toHaveAttribute("data-day-period", "night");
    expect(await background()).toContain("/images/harbor-background-night.webp");
    await page.evaluate(async () => {
      const image = new Image();
      image.src = "/images/harbor-background-night.webp";
      await image.decode();
    });
    await page.screenshot({ path: ".local/day-night-night.jpg", type: "jpeg", quality: 85, fullPage: true });

    timestamp = Date.parse("2026-09-22T05:59:57Z");
    unavailable = false;
    const sync = page.waitForResponse(response => new URL(response.url()).pathname === "/api/world-time" && response.ok());
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await sync;
    await expect(page.locator("body")).toHaveAttribute("data-day-period", "day");
    expect(await background()).toContain("/images/harbor-background.webp");
    await expect(page).toHaveURL(/\/login$/);
    expect(await page.evaluate(() => Date.now())).toBe(Date.parse("2040-01-01T12:00:00Z"));
    expect(errors).toEqual([]);

    for (const width of [1280, 375, 320]) {
      await page.setViewportSize({ width, height: 941 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  } finally { await context.close(); }
});

test("world time remains readable with authenticated hospital navigation locks", async ({ page }) => {
  const account = await createTestAccount("world-clock");
  try {
    await loginTestAccount(page, account);
    testSql("update public.characters set crew_health=0 where id='" + account.id + "'");
    await expect(page).toHaveURL(/\/harbor\/hospital$/, { timeout: 20000 });
    const response = await page.request.get("/api/world-time", { maxRedirects: 0 });
    expect(response.status()).toBe(200);
    const snapshot = await response.json();
    expect(snapshot).toEqual(worldTimeAt(Date.parse(snapshot.observed_at)));
  } finally { await cleanupTestAccounts([account]); }
});


test("gameplay refreshes reuse server time without extra clock fetches", async ({ page }) => {
  const account = await createTestAccount("clock-requests");
  try {
    await loginTestAccount(page, account);
    await page.goto("/activities");
    await page.waitForLoadState("networkidle");
    let clockRequests = 0;
    page.on("request", request => { if (new URL(request.url()).pathname === "/api/world-time") clockRequests++; });
    for (let count = 1; count <= 3; count++) {
      await page.getByRole("button", { name: "Fish for 1 Stamina", exact: true }).click();
      await expect(page.getByLabel("Shore Fishing XP", { exact: true })).toHaveText(String(count * 10));
    }
    await page.waitForLoadState("networkidle");
    expect(clockRequests).toBe(0);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect.poll(() => clockRequests).toBe(1);
  } finally { await cleanupTestAccounts([account]); }
});
