import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";

process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
if (new URL(url).hostname !== "127.0.0.1" || new URL(url).port !== "55321") {
  throw new Error("Roster tests require the local One Life At Sea database.");
}
const suffix = () => [...randomBytes(8)].map(value => String.fromCharCode(97 + value % 26)).join("");
const apiClient = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
function localSql(sql: string) {
  execFileSync("docker", ["exec", "supabase_db_one-life-at-sea", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { stdio: ["ignore", "pipe", "pipe"] });
}
function uuid(value: string) {
  if (!/^[0-9a-f-]{36}$/.test(value)) throw new Error("Invalid test fixture ID.");
  return value;
}

test("harbor roster receives real events and recovers after a connection loss", async ({ page, context, browser }) => {
  test.setTimeout(90_000);
  const observer = apiClient();
  const visitor = apiClient();
  const created: string[] = [];
  const email = `roster-${suffix()}@example.test`;
  const password = randomBytes(24).toString("hex");
  const observerName = `A A Watch ${suffix()}`;
  const visitorName = `A A Guest ${suffix()}`;
  const errors: string[] = [];
  const eventColumns: string[][] = [];
  page.on("pageerror", error => errors.push(error.name));
  page.on("websocket", socket => {
    socket.on("framereceived", frame => {
      try {
        const raw = JSON.parse(String(frame.payload));
        const message = Array.isArray(raw) ? { event: raw[3], payload: raw[4] } : raw;
        const data = message.payload?.data;
        if (message.event === "postgres_changes" && data?.table === "harbor_players" && data.record?.display_name === visitorName) {
          eventColumns.push(Object.keys(data.record).sort());
        }
      } catch { /* Ignore non-JSON transport frames. */ }
    });
  });

  try {
    const signup = await observer.auth.signUp({ email, password, options: { data: { character_name: observerName } } });
    expect(signup.error).toBeNull();
    created.push(uuid(signup.data.user!.id));
    await page.goto("/login");
    await page.getByLabel("Email address", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await expect(page).toHaveURL(/\/harbor$/);
    const roster = page.getByRole("region", { name: /^Captains in The Harbor/ });
    await expect(roster.getByRole("status", { name: "Player list connection" })).toHaveText("Live", { timeout: 30_000 });
    await expect(roster.getByText(observerName, { exact: true })).toBeVisible();
    const before = await observer.rpc("list_harbor_players", { requested_page: 0 });
    const originalTotal = before.data.total as number;

    const arrival = await visitor.auth.signUp({ email: `roster-guest-${suffix()}@example.test`, password: randomBytes(24).toString("hex"), options: { data: { character_name: visitorName } } });
    expect(arrival.error).toBeNull();
    created.push(uuid(arrival.data.user!.id));
    const character = await visitor.from("characters").select("id").single();
    const characterId = uuid(character.data!.id);
    await expect(roster.getByText(visitorName, { exact: true })).toBeVisible();
    await expect(roster.getByRole("heading")).toHaveText(`Captains in The Harbor (${originalTotal + 1})`);
    await expect.poll(() => eventColumns.length).toBeGreaterThan(0);
    expect(eventColumns.every(columns => JSON.stringify(columns) === JSON.stringify(["character_id", "display_name"]))).toBe(true);
    expect((await observer.from("characters").select("*").eq("id", characterId)).data).toEqual([]);
    const publicRows = await observer.from("harbor_players").select("*").eq("character_id", characterId);
    expect(Object.keys(publicRows.data![0]).sort()).toEqual(["character_id", "display_name"]);

    await visitor.auth.signOut();
    await expect(roster.getByText(visitorName, { exact: true })).toBeVisible();

    // Simulate server-owned travel in the public read model for this fixture only.
    localSql(`delete from public.harbor_players where character_id='${characterId}'`);
    await expect(roster.getByText(visitorName, { exact: true })).toHaveCount(0);
    localSql(`insert into public.harbor_players select id,display_name from public.characters where id='${characterId}'`);
    await expect(roster.getByText(visitorName, { exact: true })).toBeVisible();

    await context.setOffline(true);
    await expect(roster.getByRole("status", { name: "Player list connection" })).toHaveText("Reconnecting");
    localSql(`delete from public.harbor_players where character_id='${characterId}'`);
    await context.setOffline(false);
    await expect(roster.getByText(visitorName, { exact: true })).toHaveCount(0, { timeout: 30_000 });
    await expect(roster.getByRole("status", { name: "Player list connection" })).toHaveText("Live", { timeout: 30_000 });
    localSql(`insert into public.harbor_players select id,display_name from public.characters where id='${characterId}'`);
    await expect(roster.getByText(visitorName, { exact: true })).toBeVisible();

    if (originalTotal + 1 > 20) {
      await roster.getByRole("button", { name: "Next", exact: true }).click();
      await expect(roster.getByText(/Page 2 of/)).toBeVisible();
      await expect(roster.getByRole("list")).not.toHaveAttribute("aria-busy", "true");
      await roster.getByRole("button", { name: "Previous", exact: true }).click();
      await expect(roster.getByText(visitorName, { exact: true })).toBeVisible();
    }
    for (const width of [1280, 375, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.screenshot({ path: ".local/harbor-roster-desktop.jpg", type: "jpeg", quality: 75, fullPage: true });
    await page.setViewportSize({ width: 375, height: 1000 });
    await page.screenshot({ path: ".local/harbor-roster-mobile.jpg", type: "jpeg", quality: 75, fullPage: true });

    const anonymous = apiClient();
    expect((await anonymous.from("harbor_players").select("*")).error?.code).toBe("42501");
    expect((await anonymous.rpc("list_harbor_players", { requested_page: 0 })).error?.code).toBe("42501");
    const loggedOut = await browser.newContext();
    const privatePage = await loggedOut.newPage();
    await privatePage.goto("/harbor");
    await expect(privatePage).toHaveURL(/\/login$/);
    await loggedOut.close();
    expect(errors).toEqual([]);
  } finally {
    await context.setOffline(false);
    await observer.auth.signOut();
    await visitor.auth.signOut();
    for (const id of created) localSql(`delete from auth.users where id='${uuid(id)}'`);
  }
});
