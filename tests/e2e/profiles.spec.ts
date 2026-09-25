import { cleanupTestUsers } from "../support/accounts";
import { isLocalTestApi, localDatabaseContainer, localAppUrl } from "../support/local";
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";

process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
if (!isLocalTestApi(url)) {
  throw new Error("Profile tests require this project's local Supabase.");
}
test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });
const suffix = () => [...randomBytes(8)].map(value => String.fromCharCode(97 + value % 26)).join("");
const client = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
function localSql(sql: string) {
  execFileSync("docker", ["exec", localDatabaseContainer, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { stdio: ["ignore", "pipe", "pipe"] });
}
function uuid(value: string) {
  if (!/^[0-9a-f-]{36}$/.test(value)) throw new Error("Invalid test fixture ID.");
  return value;
}

test("captain profiles open from the harbor and keep private character data protected", async ({ page, browser }) => {
  const owner = client();
  const other = client();
  const created: string[] = [];
  const email = `profile-owner-${suffix()}@example.test`;
  const password = randomBytes(24).toString("hex");
  const ownerName = `AAAOwner${suffix()}`;
  const otherName = `AAAProfile${suffix()}`;
  const errors: string[] = [];
  const documents: string[] = [];
  page.on("pageerror", error => errors.push(error.name));

  try {
    for (const [api, address, name] of [[owner, email, ownerName], [other, `profile-other-${suffix()}@example.test`, otherName]] as const) {
      const signup = await api.auth.signUp({ email: address, password, options: { data: { character_name: name } } });
      expect(signup.error).toBeNull();
      created.push(uuid(signup.data.user!.id));
    }
    const target = await other.from("characters").select("id, player_number").single();
    expect(target.error).toBeNull();
    const targetId = uuid(target.data!.id);
    localSql(`update public.characters set created_at=clock_timestamp()-interval '2 days',crew_attack=9876,ship_health=81 where id='${targetId}'`);
    const publicProfile = await owner.from("character_profiles").select("*").eq("character_id", targetId).single();
    expect(publicProfile.error).toBeNull();
    expect(Object.keys(publicProfile.data!).sort()).toEqual(["arrival_location", "arrival_max_sea_distance", "arrives_at", "character_id", "character_level", "created_at", "display_name", "location", "max_sea_distance", "player_number"]);
    expect(publicProfile.data).toMatchObject({ character_id: targetId, display_name: otherName, location: "the_harbor" });
    expect((await owner.from("characters").select("*").eq("id", targetId)).data).toEqual([]);
    expect((await owner.from("character_profiles").update({ display_name: "Forged Captain" }).eq("character_id", targetId)).error?.code).toBe("42501");
    expect((await client().from("character_profiles").select("*").eq("character_id", targetId)).error?.code).toBe("42501");
    await other.auth.signOut();

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/login");
    await page.getByLabel("Email address", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await expect(page).toHaveURL(/\/harbor$/);
    const sidebar = page.getByRole("complementary", { name: "Character and harbor navigation" });
    const originalSidebar = (await sidebar.elementHandle())!;
    const main = page.getByRole("main");
    const initialFrame = await page.locator(".game-shell").boundingBox();
    page.on("request", request => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents.push(new URL(request.url()).pathname);
    });

    await sidebar.getByRole("link", { name: "My Profile", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(main.getByRole("heading", { name: new RegExp("^" + ownerName + " \\[\\d+\\]$") })).toBeVisible();
    await expect(main.getByRole("region", { name: "Defence orders", exact: true })).toBeVisible();
    await expect(main.getByText("< 1 day", { exact: true })).toBeVisible();
    await expect(sidebar.getByText("Captain", { exact: true })).toHaveCount(0);
    await main.getByRole("link", { name: "Back to The Harbor", exact: true }).click();
    const roster = page.getByRole("region", { name: /^Captains in The Harbor/ });
    await roster.getByRole("link", { name: otherName, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/players/${target.data!.player_number}$`));
    await expect(main.getByRole("heading", { name: otherName + " [" + target.data!.player_number + "]", exact: true })).toBeVisible();
    await expect(main.getByText("2 days", { exact: true })).toBeVisible();
    await expect(main.locator("time")).toHaveAttribute("datetime", publicProfile.data!.created_at);
    await expect(main.getByRole("region", { name: "Defence orders", exact: true })).toHaveCount(0);
    await expect(main.getByText("9876", { exact: true })).toHaveCount(0);
    await expect(main.getByText(email, { exact: true })).toHaveCount(0);
    await expect(sidebar.getByText(ownerName, { exact: true })).toBeVisible();
    await expect(sidebar.getByRole("progressbar", { name: "Ship Health", exact: true })).toHaveAttribute("aria-valuenow", "100");
    expect(await originalSidebar.evaluate(element => element.isConnected)).toBe(true);
    const profileFrame = await page.locator(".game-shell").boundingBox();
    expect(profileFrame!.x).toBe(initialFrame!.x);
    expect(profileFrame!.width).toBe(initialFrame!.width);

    await page.goBack();
    await expect(page).toHaveURL(/\/harbor$/);
    await page.goForward();
    await expect(main.getByRole("heading", { name: otherName + " [" + target.data!.player_number + "]", exact: true })).toBeVisible();
    expect(await originalSidebar.evaluate(element => element.isConnected)).toBe(true);
    expect(documents).toEqual([]);
    await page.screenshot({ path: ".local/profile-desktop.jpg", type: "jpeg", quality: 75, fullPage: true });
    for (const width of [768, 375, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(main.getByRole("heading", { name: otherName + " [" + target.data!.player_number + "]", exact: true })).toBeVisible();
      if (width === 375) await page.screenshot({ path: ".local/profile-mobile.jpg", type: "jpeg", quality: 75, fullPage: true });
    }

    await page.goto(`/characters/${targetId}`);
    await expect(main.getByRole("heading", { name: otherName + " [" + target.data!.player_number + "]", exact: true })).toBeVisible();
    for (const invalidId of ["not-a-captain", "ffffffff-ffff-ffff-ffff-ffffffffffff"]) {
      await page.goto(`/characters/${invalidId}`);
      await expect(main.getByRole("heading", { name: "Character not found", exact: true })).toBeVisible();
      await expect(sidebar.getByRole("link", { name: "My Profile", exact: true })).toBeVisible();
      await main.getByRole("link", { name: "Back to The Harbor", exact: true }).click();
      await expect(page).toHaveURL(/\/harbor$/);
    }

    const loggedOut = await browser.newContext();
    try {
      const anonymousPage = await loggedOut.newPage();
      await anonymousPage.goto(`${localAppUrl}/characters/${targetId}`);
      await expect(anonymousPage).toHaveURL(/\/login$/);
    } finally { await loggedOut.close(); }
    expect(errors).toEqual([]);
  } finally {
    await page.close();
    await owner.auth.signOut();
    await other.auth.signOut();
    cleanupTestUsers(created);
  }
});
