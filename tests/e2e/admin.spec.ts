import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import type { Database } from "../../src/lib/database.types";
import { isLocalTestApi, localDatabaseContainer } from "../support/local";

process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
if (!isLocalTestApi(url)) throw new Error("Admin tests require local Supabase.");
const client = () => createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
function sql(statement: string) {
  return execFileSync("docker", ["exec","-i",localDatabaseContainer,"psql","-U","postgres","-d","postgres","-v","ON_ERROR_STOP=1","-q","-t","-A"],
    { input: statement, encoding: "utf8", stdio: ["pipe","pipe","pipe"] });
}
async function account(admin = false) {
  const api = client(), tag = randomBytes(10).toString("hex");
  const email = "admin-" + tag + "@example.test", password = randomBytes(24).toString("hex"), name = "Captain " + tag;
  const signup = await api.auth.signUp({ email, password, options: { data: { character_name: name, is_admin: true } } });
  expect(signup.error).toBeNull();
  const own = await api.from("characters").select("id").single();
  expect(own.error).toBeNull();
  const id = own.data!.id, userId = signup.data.user!.id;
  if (![id, userId].every(value => /^[0-9a-f-]{36}$/.test(value))) throw new Error("Invalid fixture ID.");
  if (admin) sql("insert into private.admin_members(user_id) values('" + userId + "')");
  return { api, id, userId, email, password, name };
}
async function login(page: Page, own: Awaited<ReturnType<typeof account>>) {
  await page.goto("/login");
  await page.getByLabel("Email address", { exact: true }).fill(own.email);
  await page.getByLabel("Password", { exact: true }).fill(own.password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/harbor$/);
}
async function cleanup(accounts: Awaited<ReturnType<typeof account>>[]) {
  for (const own of accounts) {
    await own.api.auth.signOut();
    sql("delete from auth.users where id='" + own.userId + "'");
  }
}

test("regular players cannot enter admin or promote themselves with metadata", async ({ page }) => {
  const own = await account();
  try {
    await login(page, own);
    await expect(page.getByRole("link", { name: "Admin panel", exact: true })).toHaveCount(0);
    expect((await own.api.rpc("is_admin")).data).toBe(false);
    expect((await own.api.rpc("admin_read", { resource: "characters" })).error?.message).toBe("ADMIN_REQUIRED");
    const response = await page.goto("/admin");
    expect(response?.status()).toBe(403);
    await expect(page.getByRole("heading", { name: "Administration", exact: true })).toHaveCount(0);
  } finally { await cleanup([own]); }
});

test("admin edits players, grants equipment, recovers a lost grant and browses audited records", async ({ page }) => {
  const admin = await account(true), player = await account();
  try {
    await login(page, admin);
    await page.getByRole("link", { name: "Admin panel", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Game overview" })).toBeVisible();
    await page.getByRole("navigation", { name: "Administration", exact: true }).getByRole("link", { name: "Players", exact: true }).click();
    await page.getByLabel("Search players").fill(player.name);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.getByRole("link", { name: player.name, exact: true }).click();
    await page.getByRole("button", { name: "Edit character", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("gold_coins", { exact: true }).fill("54321");
    await dialog.getByLabel("crew_attack", { exact: true }).fill("1234");
    await dialog.getByLabel("energy", { exact: true }).fill("37");
    await dialog.getByLabel("Reason for change").fill("Verify player correction");
    await dialog.getByRole("button", { name: "Review changes", exact: true }).click();
    await dialog.getByRole("button", { name: "Confirm change", exact: true }).click();
    await expect(dialog.getByRole("status")).toContainText("Changes saved.");
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    expect((await player.api.rpc("get_game_state")).data?.gold_coins).toBe(54321);
    expect((await player.api.rpc("get_game_state")).data?.crew_attack).toBe(1234);
    expect((await player.api.rpc("get_game_state")).data?.energy).toBe(37);
    const grant = page.locator(".admin-card").filter({ has: page.getByRole("heading", { name: "Generate items", exact: true }) });
    await grant.getByRole("combobox", { name: "Item", exact: true }).selectOption("cutlass", { timeout: 10000 });
    await grant.getByLabel("Quantity", { exact: true }).fill("2");
    await grant.getByLabel("Damage", { exact: true }).fill("42.15");
    await grant.getByLabel("Accuracy", { exact: true }).fill("65.25");
    await grant.getByLabel("Reason for change").fill("Verify equipment grant");
    await grant.getByRole("button", { name: "Review item grant" }).click();
    await grant.getByRole("button", { name: "Confirm change" }).click();
    await expect(grant.getByRole("status")).toContainText("2 x Sailor's Cutlass generated.");
    const equipment = (await player.api.rpc("list_inventory", { category_id: "crew_weapons" })).data!;
    expect(equipment.total).toBe(2);
    expect(equipment.items[0].stats?.damage).toBe(42.15);
    await grant.getByRole("button", { name: "Done", exact: true }).click();
    await grant.getByRole("combobox", { name: "Item", exact: true }).selectOption("linen_bandages");
    await grant.getByLabel("Quantity", { exact: true }).fill("25");
    await grant.getByLabel("Reason for change").fill("Recover interrupted grant");
    await grant.getByRole("button", { name: "Review item grant" }).click();
    let lost = false;
    await page.route("**/admin/players/**", async route => {
      if (!lost && route.request().method() === "POST" && route.request().headers()["next-action"]) {
        lost = true;
        await route.fetch();
        await route.abort("failed");
      } else await route.continue();
    });
    await grant.getByRole("button", { name: "Confirm change" }).click();
    await expect(grant.getByRole("button", { name: "Retry same request" })).toBeVisible();
    await page.unroute("**/admin/players/**");
    await page.reload();
    const pending = page.getByRole("region", { name: "Unconfirmed admin requests" });
    await expect(pending).toBeVisible();
    await pending.getByRole("button", { name: "Check saved request" }).click();
    await expect(pending).toHaveCount(0);
    expect((await player.api.rpc("list_inventory", { category_id: "medical" })).data?.items[0].quantity).toBe(25);

    await page.getByRole("button", { name: "Edit character" }).click();
    await dialog.getByLabel("gold_coins", { exact: true }).fill("100");
    sql("update public.characters set gold_coins=60000 where id='" + player.id + "'");
    await dialog.getByLabel("Reason for change").fill("Stale correction test");
    await dialog.getByRole("button", { name: "Review changes" }).click();
    await dialog.getByRole("button", { name: "Confirm change" }).click();
    await expect(dialog.getByRole("alert")).toContainText("record changed");
    expect((await player.api.rpc("get_game_state")).data?.gold_coins).toBe(60000);
    await dialog.getByRole("button", { name: "Close", exact: true }).click();

    const stacks = page.locator(".admin-card").filter({ has: page.getByRole("heading", { name: "Item stacks (1)", exact: true }) });
    await stacks.getByRole("button", { name: "Open row 1", exact: true }).click();
    const deletion = dialog.locator(".admin-danger");
    await deletion.getByLabel("Reason for change").fill("Remove test inventory");
    await deletion.getByRole("button", { name: "Review deletion" }).click();
    await deletion.getByRole("button", { name: "Confirm change" }).click();
    await expect.poll(async () => (await player.api.rpc("list_inventory", { category_id: "medical" })).data?.total).toBe(0);
    if (await dialog.isVisible()) await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("navigation", { name: "Administration", exact: true }).getByRole("link", { name: "Audit log" }).click();
    await page.getByLabel("Search records").fill("Recover interrupted grant");
    await page.getByRole("combobox", { name: "Exact column", exact: true }).selectOption("actor_id");
    await page.getByLabel("Exact value", { exact: true }).fill(admin.userId);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByText("1 record(s)", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Open row 1" }).click();
    await expect(dialog).toContainText("Recover interrupted grant");
    await expect(dialog).toContainText("after_data");
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await page.goto("/admin/players/" + player.id);
    for (const width of [1280, 768, 375, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.screenshot({ path: ".local/admin-desktop.png", fullPage: true });
    await page.setViewportSize({ width: 375, height: 1000 });
    await page.screenshot({ path: ".local/admin-mobile.png", fullPage: true });
  } finally { await cleanup([admin, player]); }
});

test("admin remains accessible in hospital and combat, and revocation is immediate", async ({ page }) => {
  const admin = await account(true), player = await account();
  try {
    await login(page, admin);
    sql("update public.characters set crew_health=0 where id='" + admin.id + "'");
    await page.goto("/admin/players/" + admin.id);
    await expect(page.getByRole("heading", { name: "Administration", exact: true })).toBeVisible();
    const release = page.locator("form").filter({ has: page.getByRole("button", { name: "Review hospital release" }) });
    await release.getByLabel("Reason for change").fill("Release admin patient");
    await release.getByRole("button", { name: "Review hospital release" }).click();
    await page.getByRole("button", { name: "Confirm change" }).click();
    await expect.poll(async () => (await admin.api.rpc("get_game_state")).data?.hospital_until).toBeNull();
    const start = await admin.api.rpc("start_combat", { target_id: player.id, request_id: randomUUID() });
    expect(start.error).toBeNull();
    await page.goto("/admin/players/" + admin.id);
    await expect(page.getByRole("heading", { name: "Administration", exact: true })).toBeVisible();
    const combatId = (await admin.api.rpc("get_game_state")).data!.active_attack!.battle_id;
    const before = (await admin.api.rpc("get_game_state")).data!;
    const end = page.locator("form").filter({ has: page.getByRole("button", { name: "Review end combat" }) });
    await end.getByLabel("Reason for change").fill("Resolve stuck encounter");
    await end.getByRole("button", { name: "Review end combat" }).click();
    await page.getByRole("button", { name: "Confirm change" }).click();
    await expect.poll(async () => (await admin.api.rpc("get_game_state")).data?.active_attack).toBeNull();
    const after = (await admin.api.rpc("get_game_state")).data!;
    expect(after.ship_health).toBe(before.ship_health);
    expect(after.crew_health).toBe(before.crew_health);
    await expect(page.getByText("No active combat.", { exact: true })).toBeVisible();
    const log = await admin.api.rpc("get_combat_log", { battle_id: combatId });
    expect(log.error).toBeNull();
    expect(log.data?.events.some(event => event.kind === "admin_end")).toBe(true);
    const job = await admin.api.rpc("start_ship_upgrade", { stat: "attack", energy_amount: 5, expected_workshop_id: "ship_1", request_id: randomUUID() });
    expect(job.error).toBeNull();
    await page.reload();
    const cancellation = page.locator("form").filter({ has: page.getByRole("button", { name: "Review job cancellation" }) });
    await cancellation.getByLabel("Reason for change").fill("Cancel test ship job");
    await cancellation.getByRole("button", { name: "Review job cancellation" }).click();
    await page.getByRole("button", { name: "Confirm change" }).click();
    await expect(page.getByRole("button", { name: "Review job cancellation" })).toHaveCount(0);
    await expect.poll(async () => (await admin.api.rpc("get_game_state")).data?.training.ship_job).toBeNull();
    sql("delete from private.admin_members where user_id='" + admin.userId + "'");
    expect((await admin.api.rpc("admin_overview")).error?.message).toBe("ADMIN_REQUIRED");
    expect((await page.request.get("/admin")).status()).toBe(403);
    await page.goto("/admin");
    await expect(page.getByText("Administrator access is required.", { exact: true })).toBeVisible();
  } finally { await cleanup([admin, player]); }
});

test("concurrent repeated item grants commit once and unique grants serialize", async () => {
  const admin = await account(true), player = await account();
  try {
    const request = { action: "grant_items", payload: { character_id: player.id, item_id: "linen_bandages", quantity: "7" }, request_id: randomUUID(), reason: "Concurrent grant test" };
    const repeated = await Promise.all(Array.from({ length: 8 }, () => admin.api.rpc("admin_mutate", request)));
    expect(repeated.every(result => !result.error)).toBe(true);
    expect(new Set(repeated.map(result => result.data?.audit_id)).size).toBe(1);
    const unique = await Promise.all(Array.from({ length: 8 }, () => admin.api.rpc("admin_mutate", { ...request, request_id: randomUUID() })));
    expect(unique.every(result => !result.error)).toBe(true);
    expect((await player.api.rpc("list_inventory", { category_id: "medical" })).data?.items[0].quantity).toBe(63);
    const audit = await admin.api.rpc("admin_read", { resource: "admin_audit", filters: { actor_id: admin.userId } });
    expect(audit.data?.total).toBe("9");
    expect((await player.api.rpc("admin_mutate", request)).error?.message).toBe("ADMIN_REQUIRED");
  } finally { await cleanup([admin, player]); }
});

