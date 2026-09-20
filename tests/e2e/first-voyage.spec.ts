import { isLocalTestApi, localAppUrl, localMailUrl } from "../support/local";
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

process.loadEnvFile(".env.local");
const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const apiKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
if (!isLocalTestApi(apiUrl)) {
  throw new Error("These tests only run against this project's local Supabase instance.");
}
const suffix = () => [...randomBytes(10)].map(value => String.fromCharCode(97 + value % 26)).join("");
const password = () => `Sailing-${randomBytes(18).toString("hex")}`;

async function fillRegistration(page: Page, email: string, secret: string, name: string) {
  await page.goto("/register");
  await page.getByLabel("Character name", { exact: true }).fill(name);
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(secret);
  await page.getByLabel("Confirm password", { exact: true }).fill(secret);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
}

async function register(page: Page, email: string, secret: string, name: string) {
  await fillRegistration(page, email, secret, name);
  await expect(page).toHaveURL(/\/harbor$/);
}

async function login(page: Page, email: string, secret: string) {
  await page.goto("/login");
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(secret);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
}

async function recoveryLink(email: string) {
  let messageId: string | undefined;
  await expect.poll(async () => {
    const response = await fetch(localMailUrl + "/api/v1/messages");
    const body = await response.json();
    messageId = body.messages.find((message: { ID: string; To: { Address: string }[]; Subject: string }) =>
      message.To.some(recipient => recipient.Address === email) && /reset/i.test(message.Subject))?.ID;
    return !!messageId;
  }, { message: "A recovery email should reach the local test inbox" }).toBe(true);
  const message = await (await fetch(`${localMailUrl}/api/v1/message/${messageId}`)).json();
  const link = (message.HTML as string).match(/href="([^"]*\/auth\/v1\/verify[^"]*)"/)?.[1]?.replaceAll("&amp;", "&");
  if (!link) throw new Error("The test email did not contain a recovery link.");
  return link;
}

test("registration creates the character and returns to the same harbor after login", async ({ page, browser }) => {
  const email = `voyage-${suffix()}@example.test`;
  const secret = suffix().slice(0, 6);
  const name = `Captain_${suffix()}_123_🦜_LongName`;
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.name));
  await page.goto("/harbor");
  await expect(page).toHaveURL(/\/login$/);
  await fillRegistration(page, email, secret, "   ");
  await expect(page.locator("#name-error")).toContainText("Enter a character name");
  await register(page, email, secret, name);
  await page.goto("/create-character");
  await expect(page).toHaveURL(/\/harbor$/);
  await expect(page.getByRole("heading", { name: `Welcome ashore, ${name}.` })).toBeVisible();
  const image = page.getByRole("img");
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
  await page.getByRole("navigation", { name: "Harbor locations" }).getByRole("link", { name: "Marketplace" }).click();
  await expect(page.getByRole("heading", { name: "Most Popular", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Harbor locations" }).getByRole("link", { name: "Marketplace" })).toHaveAttribute("aria-current", "page");
  await page.getByRole("navigation", { name: "Harbor locations" }).getByRole("link", { name: "Shipyard" }).click();
  await expect(page.getByRole("heading", { name: "The shipwright is not taking orders." })).toBeVisible();
  await page.getByRole("link", { name: "Back to The Harbor" }).click();
  await expect(page).toHaveURL(/\/harbor$/);
  await expect(page.getByRole("heading", { name: `Welcome ashore, ${name}.` })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: `Welcome ashore, ${name}.` })).toBeVisible();
  const response = await page.goto("/harbor");
  expect(response?.headers()["cache-control"]).toContain("no-store");
  for (const width of [1280, 768, 375, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByRole("button", { name: "Log out", exact: true }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/harbor/shipyard");
  await expect(page).toHaveURL(/\/login$/);
  await login(page, email, secret);
  await expect(page).toHaveURL(/\/harbor$/);
  await expect(page.getByRole("heading", { name: `Welcome ashore, ${name}.` })).toBeVisible();

  const otherContext = await browser.newContext({ baseURL: localAppUrl });
  const other = await otherContext.newPage();
  const otherEmail = `voyage-${suffix()}@example.test`;
  const otherSecret = password();
  await fillRegistration(other, otherEmail, otherSecret, name.toUpperCase());
  await expect(other.locator("#name-error")).toContainText("already taken");
  await expect(other.getByLabel("Email address", { exact: true })).toHaveValue(otherEmail);
  await register(other, otherEmail, otherSecret, `Mariner ${suffix()}`);
  await otherContext.close();
  expect(errors).toEqual([]);
});

test("password recovery uses the local email link and preserves the character", async ({ page }) => {
  const email = `recovery-${suffix()}@example.test`;
  const oldPassword = password();
  const newPassword = suffix().slice(0, 6);
  const name = `Sailor ${suffix()}`;
  await register(page, email, oldPassword, name);
  await page.getByRole("button", { name: "Log out", exact: true }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  await expect(page.getByRole("heading", { name: "Find your way back." })).toBeVisible();
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText("If an account exists");
  const link = await recoveryLink(email);
  await page.goto(link).catch(() => { throw new Error("The recovery link could not be opened."); });
  await expect(page).toHaveURL(/\/reset-password$/);
  await page.getByLabel("New password", { exact: true }).fill(newPassword);
  await page.getByLabel("Confirm password", { exact: true }).fill(newPassword);
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page).toHaveURL(/\/login\?notice=password-updated$/);
  await login(page, email, oldPassword);
  await expect(page.locator(".o-notice[role=alert]")).toContainText("incorrect");
  await login(page, email, newPassword);
  await expect(page).toHaveURL(/\/harbor$/);
  await expect(page.getByRole("heading", { name: `Welcome ashore, ${name}.` })).toBeVisible();
});

test("the real Data API enforces owner isolation and one character per account", async () => {
  const client = () => createClient(apiUrl, apiKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const first = client();
  const second = client();
  const anonymous = client();
  for (const api of [first, second]) {
    const { data, error } = await api.auth.signUp({ email: `api-${suffix()}@example.test`, password: password(), options: { data: { character_name: `Sailor ${suffix()}` } } });
    expect(error?.code).toBeUndefined();
    expect(!!data.session).toBe(true);
  }
  const attempts = await Promise.all(["Captain", "Sailor"].map(prefix => first.from("characters").insert({ display_name: `${prefix} ${suffix()}` })));
  expect(attempts.map(result => result.error?.code ?? "created").sort()).toEqual(["23505", "23505"]);
  const own = await first.from("characters").select("*");
  expect(own.error?.code).toBeUndefined();
  expect(own.data).toHaveLength(1);
  const changed = await first.auth.updateUser({ data: { character_name: `Changed ${suffix()}`, user_id: "tampered", location: "open_sea" } });
  expect(changed.error?.code).toBeUndefined();
  expect((await first.from("characters").select("*")).data).toEqual(own.data);
  const other = await second.from("characters").select("*").eq("id", own.data![0].id);
  expect(other.data).toEqual([]);
  expect((await anonymous.from("characters").select("*")).error?.code).toBe("42501");
  const tampered = await second.from("characters").insert({ display_name: `Pirate ${suffix()}`, user_id: own.data![0].user_id, location: "open_sea" });
  expect(tampered.error?.code).toBe("42501");
  await first.auth.signOut();
  await second.auth.signOut();
});

test("simultaneous registrations cannot reserve one name twice or leave orphan accounts", async () => {
  const client = () => createClient(apiUrl, apiKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const name = `Mariner ${suffix()}`;
  const attempts = [0, 1].map(() => ({ api: client(), email: `race-${suffix()}@example.test`, secret: password() }));
  const results = await Promise.all(attempts.map((entry, index) => entry.api.auth.signUp({
    email: entry.email, password: entry.secret, options: { data: { character_name: index ? name.toUpperCase() : name } },
  })));
  expect(results.filter(result => !result.error)).toHaveLength(1);
  expect(results.filter(result => result.error)).toHaveLength(1);
  for (const [index, result] of results.entries()) {
    const entry = attempts[index];
    if (result.error) {
      const rejectedLogin = await entry.api.auth.signInWithPassword({ email: entry.email, password: entry.secret });
      expect(rejectedLogin.error?.code).toBe("invalid_credentials");
      const retry = await entry.api.auth.signUp({ email: entry.email, password: entry.secret, options: { data: { character_name: `Retry ${suffix()}` } } });
      expect(retry.error?.code).toBeUndefined();
      expect(!!retry.data.session).toBe(true);
    }
    const character = await entry.api.from("characters").select("id");
    expect(character.data).toHaveLength(1);
    await entry.api.auth.signOut();
  }
  const incomplete = client();
  const email = `missing-${suffix()}@example.test`;
  const secret = suffix().slice(0, 6);
  expect(!!(await incomplete.auth.signUp({ email, password: secret })).error).toBe(true);
  expect((await incomplete.auth.signInWithPassword({ email, password: secret })).error?.code).toBe("invalid_credentials");
});

test("bad account links and unavailable locations have a way back", async ({ page }) => {
  await page.goto("/auth/callback?code=invalid&next=https://example.invalid");
  await expect(page).toHaveURL(/\/auth\/link-error$/);
  await expect(page.getByRole("link", { name: "Reset password", exact: true })).toBeVisible();
  await page.goto("/reset-password");
  await expect(page.getByRole("link", { name: "Request a new reset link" })).toBeVisible();
  await page.goto("/unknown-shore");
  await expect(page.getByRole("heading", { name: "Uncharted waters" })).toBeVisible();
});
