import { isLocalTestApi, localDatabaseContainer } from "../support/local";
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";

process.loadEnvFile(".env.local");
const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const apiKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
if (!isLocalTestApi(apiUrl)) {
  throw new Error("Training tests require this project's local Supabase.");
}
const suffix = () => [...randomBytes(10)].map(value => String.fromCharCode(97 + value % 26)).join("");
const secret = () => randomBytes(24).toString("hex");
const client = () => createClient(apiUrl, apiKey, { auth: { persistSession: false, autoRefreshToken: false } });

test("training updates both tabs and bars, persists after login, and fits small screens", async ({ page }) => {
  const email = `training-${suffix()}@example.test`;
  const password = secret();
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.name));
  await page.goto("/register");
  await page.getByLabel("Character name", { exact: true }).fill(`Captain ${suffix()}`);
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page).toHaveURL(/\/harbor$/);
  const energy = page.getByRole("progressbar", { name: "Energy", exact: true });
  await expect(energy).toHaveAttribute("aria-valuenow", "100");
  await expect(page.getByRole("progressbar", { name: "Ship Health" })).toHaveAttribute("aria-valuenow", "100");
  await expect(page.getByRole("progressbar", { name: "Crew Health" })).toHaveAttribute("aria-valuenow", "100");
  const navigation = page.getByRole("navigation", { name: "Harbor locations" });
  await navigation.getByRole("link", { name: "Crew Training" }).click();
  for (const [index, stat] of ["Attack", "Defense", "Speed", "Accuracy"].entries()) {
    await expect(page.getByLabel(`${stat} stat`, { exact: true })).toHaveText("10");
    await page.getByRole("button", { name: `Train ${stat} for 5 Energy`, exact: true }).click();
    await expect(page.getByLabel(`${stat} stat`, { exact: true })).toHaveText("11");
    await expect(energy).toHaveAttribute("aria-valuenow", String(95 - index * 5));
  }
  await expect(page.getByText("Crew Accuracy +1. Spent 5 Energy.", { exact: true })).toBeVisible();
  await navigation.getByRole("link", { name: "Ship Upgrades" }).click();
  for (const stat of ["Attack", "Defense", "Speed", "Accuracy"]) {
    await expect(page.getByLabel(`${stat} stat`, { exact: true })).toHaveText("10");
  }
  await page.getByRole("button", { name: "Upgrade Attack for 5 Energy", exact: true }).click();
  await expect(page.getByLabel("Attack stat", { exact: true })).toHaveText("11");
  await expect(energy).toHaveAttribute("aria-valuenow", "75");
  await page.reload();
  await expect(energy).toHaveAttribute("aria-valuenow", "75");
  for (const width of [1280, 768, 375, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole("button", { name: "Upgrade Attack for 5 Energy", exact: true })).toBeVisible();
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: ".local/training-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 375, height: 1000 });
  await page.screenshot({ path: ".local/training-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Log out", exact: true }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/harbor$/);
  await expect(energy).toHaveAttribute("aria-valuenow", "75");
  await navigation.getByRole("link", { name: "Crew Training" }).click();
  await expect(page.getByLabel("Attack stat", { exact: true })).toHaveText("11");
  const api = client();
  expect((await api.auth.signInWithPassword({ email, password })).error).toBeNull();
  const spent = await Promise.all(Array.from({ length: 15 }, () => api.rpc("train_stat", { training_group: "ship", stat: "speed" })));
  expect(spent.every(result => !result.error)).toBe(true);
  await page.reload();
  await expect(energy).toHaveAttribute("aria-valuenow", "0");
  await expect(page.getByRole("button", { name: "Train Attack for 5 Energy", exact: true })).toBeDisabled();
  await expect(page.getByText(/Not enough Energy/)).toBeVisible();
  const own = await api.from("characters").select("id").single();
  expect(own.error).toBeNull();
  const characterId = own.data!.id as string;
  if (!/^[0-9a-f-]{36}$/.test(characterId)) throw new Error("Invalid local test character ID.");
  // Move only this test fixture near its next recovery boundary.
  execFileSync("docker", ["exec", localDatabaseContainer, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c",
    `update public.characters set energy=4, energy_updated_at=clock_timestamp()-interval '4 minutes 45 seconds' where id='${characterId}'`],
    { stdio: ["ignore", "pipe", "pipe"] });
  await page.reload();
  await expect(energy).toHaveAttribute("aria-valuenow", "4");
  await expect(page.getByRole("button", { name: "Train Attack for 5 Energy", exact: true })).toBeDisabled();
  await expect(energy).toHaveAttribute("aria-valuenow", "5", { timeout: 25_000 });
  await page.getByRole("button", { name: "Train Attack for 5 Energy", exact: true }).click();
  await expect(page.getByLabel("Attack stat", { exact: true })).toHaveText("12");
  await expect(energy).toHaveAttribute("aria-valuenow", "0");
  await api.auth.signOut();
  expect(errors).toEqual([]);
});

test("simultaneous training cannot overspend and the API cannot forge resources", async () => {
  const first = client();
  const second = client();
  for (const api of [first, second]) {
    const signup = await api.auth.signUp({
      email: `training-api-${suffix()}@example.test`, password: secret(),
      options: { data: { character_name: `Sailor ${suffix()}` } },
    });
    expect(signup.error).toBeNull();
  }
  expect((await first.from("characters").update({ energy: 100, ship_health: 999, crew_attack: 999 }).not("id", "is", null)).error?.code).toBe("42501");
  expect((await first.rpc("train_stat", { training_group: "crew", stat: "health" })).error?.code).toBe("22023");
  const results = await Promise.all(Array.from({ length: 25 }, () => first.rpc("train_stat", { training_group: "crew", stat: "attack" })));
  expect(results.filter(result => !result.error)).toHaveLength(20);
  expect(results.filter(result => result.error?.message === "NOT_ENOUGH_ENERGY")).toHaveLength(5);
  const state = await first.rpc("get_game_state");
  expect(state.error).toBeNull();
  expect(state.data).toMatchObject({ energy: 0, crew_attack: 30, ship_attack: 10, crew_health: 100, ship_health: 100 });
  expect((await second.rpc("get_game_state")).data).toMatchObject({ energy: 100, crew_attack: 10 });
  expect((await client().rpc("train_stat", { training_group: "crew", stat: "attack" })).error?.code).toBe("42501");
  await first.auth.signOut();
  await second.auth.signOut();
});
