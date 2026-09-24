import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { createTestAccount, createTestClient, cleanupTestAccounts, cleanupTestRegistrations, loginTestAccount, testSql } from "../support/accounts";

test("registration rejects numbers and spaces in the browser and server action", async ({ page }) => {
  const tag = randomBytes(10).toString("hex");
  const email = "name-rule-" + tag + "@example.test";
  const password = randomBytes(24).toString("hex");
  const name = "Åsa" + tag.replace(/[0-9]/g, digit => String.fromCharCode(103 + Number(digit)));
  try {
    await page.goto("/register");
    const field = page.getByLabel("Character name", { exact: true });
    await page.getByLabel("Email address", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByLabel("Confirm password", { exact: true }).fill(password);
    for (const invalid of ["Captain7", "Captain Storm", " Captain", "Captain ", "Captain١", "Captain\u00a0Storm"]) {
      await field.fill(invalid);
      await expect(page.locator("#name-error")).toHaveText("Use a character name without numbers or spaces.");
      expect(await field.evaluate((element: HTMLInputElement) => element.checkValidity())).toBe(false);
    }

    // Bypass native validation to exercise the actual server action.
    await page.locator("form.o-form").evaluate((form: HTMLFormElement) => { form.noValidate = true; });
    await field.fill("Captain7");
    const response = page.waitForResponse(result => result.request().method() === "POST" && new URL(result.url()).pathname === "/register");
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    expect((await response).ok()).toBe(true);
    await expect(page.locator("form.o-form")).toHaveAttribute("aria-busy", "false");
    await expect(page).toHaveURL(/\/register$/);
    await expect(page.locator("#name-error")).toHaveText("Use a character name without numbers or spaces.");
    expect(testSql("select count(*) from auth.users where email='" + email + "'").trim()).toBe("0");

    await field.fill(name);
    await expect(page.locator("#name-error")).toBeEmpty();
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByLabel("Confirm password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    await expect(page).toHaveURL(/\/harbor$/);
    await expect(page.locator(".o-page-hero").getByText("Welcome ashore, " + name + ".", { exact: true })).toBeVisible();
  } finally { await page.close(); cleanupTestRegistrations([email]); }
});

test("direct Auth rejects invalid names and an unfinished account can choose a valid name", async ({ page }) => {
  const api = createTestClient();
  const email = "invalid-auth-" + randomBytes(10).toString("hex") + "@example.test";
  const password = randomBytes(24).toString("hex");
  try {
    for (const name of ["Captain8", "Captain Storm", "Captain²"]) {
      expect((await api.auth.signUp({ email, password, options: { data: { character_name: name } } })).error).not.toBeNull();
      expect(testSql("select count(*) from auth.users where email='" + email + "'").trim()).toBe("0");
    }
  } finally { cleanupTestRegistrations([email]); }

  const account = await createTestAccount("unfinished-name");
  try {
    await loginTestAccount(page, account);
    testSql("delete from public.characters where id='" + account.id + "'");
    await page.goto("/create-character");
    const field = page.getByLabel("Character name", { exact: true });
    await field.fill("Captain9");
    await expect(page.locator("#name-error")).toHaveText("Use a character name without numbers or spaces.");
    expect((await account.api.from("characters").insert({ display_name: "Captain Storm" })).error?.code).toBe("23514");
    await page.locator("form.o-form").evaluate((form: HTMLFormElement) => { form.noValidate = true; });
    const response = page.waitForResponse(result => result.request().method() === "POST" && new URL(result.url()).pathname === "/create-character");
    await page.getByRole("button", { name: "Enter the harbor", exact: true }).click();
    expect((await response).ok()).toBe(true);
    await expect(page.locator("form.o-form")).toHaveAttribute("aria-busy", "false");
    await expect(page).toHaveURL(/\/create-character$/);
    expect((await account.api.from("characters").select("id")).data).toEqual([]);
    await field.fill(account.name);
    await page.getByRole("button", { name: "Enter the harbor", exact: true }).click();
    await expect(page).toHaveURL(/\/harbor$/);
    expect((await account.api.from("characters").select("player_number").single()).data?.player_number).toBeGreaterThan(account.playerNumber);
  } finally { await cleanupTestAccounts([account]); }
});
