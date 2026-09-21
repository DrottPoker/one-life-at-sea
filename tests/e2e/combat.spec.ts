import { isLocalTestApi, localDatabaseContainer, localAppUrl } from "../support/local";
import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import type { Database } from "../../src/lib/database.types";
import type { CombatResponse } from "../../src/lib/combat";

process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
if (!isLocalTestApi(url)) throw new Error("Combat tests require local Supabase.");
const client = () => createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const suffix = () => [...randomBytes(10)].map(value => String.fromCharCode(97 + value % 26)).join("");
function uuid(value: string) {
  if (!/^[0-9a-f-]{36}$/.test(value)) throw new Error("Invalid fixture ID.");
  return value;
}
function sql(statement: string) {
  execFileSync("docker", ["exec", localDatabaseContainer, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", statement],
    { stdio: ["ignore", "pipe", "pipe"] });
}
async function captain() {
  const api = client();
  const email = "combat-" + suffix() + "@example.test";
  const password = randomBytes(24).toString("hex");
  const name = "Captain" + suffix();
  const signup = await api.auth.signUp({ email, password, options: { data: { character_name: name } } });
  expect(signup.error).toBeNull();
  const userId = uuid(signup.data.user!.id);
  const result = await api.from("characters").select("id, player_number").single();
  expect(result.error).toBeNull();
  // Combat scenarios use explicit baseline stats; signup defaults are tested with training.
  sql("update public.characters set energy_updated_at=clock_timestamp()+interval '1 day',ship_attack=1,ship_defense=1,ship_speed=1,ship_accuracy=1,crew_attack=1,crew_defense=1,crew_speed=1,crew_accuracy=1 where id=\'" + uuid(result.data!.id) + "\'");
  return { api, email, password, name, userId, id: uuid(result.data!.id), playerNumber: result.data!.player_number };
}
function battle(data: CombatResponse | null) {
  expect(data).not.toBeNull();
  if (!data || "error" in data) throw new Error("Expected battle: " + (data && "error" in data ? data.error : "missing"));
  return data.battle;
}
async function start(api: SupabaseClient<Database>, targetId: string, requestId: string) {
  for (let i = 0; ; i++) {
    const result = await api.rpc("start_combat", { target_id: targetId, request_id: requestId });
    if (result.error?.code !== "40001" || i === 3) return result;
  }
}
async function login(page: Page, account: Awaited<ReturnType<typeof captain>>) {
  await page.goto("/login");
  await page.getByLabel("Email address", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/harbor$/);
}
async function cleanup(accounts: Awaited<ReturnType<typeof captain>>[]) {
  for (const account of accounts) {
    await account.api.auth.signOut();
    sql("delete from auth.users where id='" + account.userId + "'");
  }
}

test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

test("fullscreen attack keeps preparation and both phases on one route, locks navigation, then publishes a report", async ({ page, browser }) => {
  const a = await captain(), d = await captain();
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.name));
  try {
    sql("update public.characters set ship_health=63,crew_health=85,ship_recovery_at=clock_timestamp()+interval '1 hour',crew_recovery_at=clock_timestamp()+interval '1 hour' where id='" + a.id + "'");
    sql("update public.characters set ship_attack=24681357 where id='" + d.id + "'");
    expect((await d.api.rpc("save_defence_orders", { preset: "boarding" })).error).toBeNull();
    await d.api.auth.signOut();
    const preview = await a.api.rpc("get_combat_preview", { target_id: d.id });
    expect(JSON.stringify(preview.data)).not.toContain("24681357");
    expect(preview.data).toMatchObject({ can_start: true, attacker: { ship_health: 63, crew_health: 85 }, defender: { cannons: null, weapon: null, ship: null, crew: null, ammo: null } });
    await page.setViewportSize({ width: 1280, height: 1050 });
    await login(page, a);
    await page.goto("/characters/" + d.id);
    await page.getByRole("link", { name: "Attack", exact: true }).click();
    await expect(page).toHaveURL(new RegExp("/attack/" + d.playerNumber + "$"));
    const main = page.getByRole("main");
    await expect(page.locator(".o-sidebar")).toHaveCount(0);
    await expect(page.locator(".o-masthead")).toHaveCount(0);
    const opponent = main.getByRole("region", { name: "Opponent ship and crew", exact: true });
    await expect(opponent.getByText("Unknown", { exact: true })).toHaveCount(2);
    const scene = main.locator(".o-combat-scene img");
    await expect(scene).toHaveAttribute("alt", "Two sailing ships face each other on the open sea.");
    await expect.poll(() => scene.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    await page.screenshot({ path: ".local/attack-prepare-desktop.jpg", type: "jpeg", quality: 75, fullPage: true });
    await main.getByRole("link", { name: "Back to profile", exact: true }).click();
    await expect(page).toHaveURL(new RegExp("/players/" + d.playerNumber + "$"));
    await page.getByRole("link", { name: "Attack", exact: true }).click();
    await main.getByRole("button", { name: "Start battle 10 Energy", exact: true }).click();
    await expect(main.getByRole("button", { name: /^Fire cannons 1 salvo/ })).toBeVisible();
    await expect(page).toHaveURL(new RegExp("/attack/" + d.playerNumber + "$"));
    const battleId = uuid((await a.api.rpc("get_attack_lock")).data!.battle_id);
    const lockedUrl = page.url();
    await expect(opponent.getByText("Basic cannons", { exact: true })).toBeVisible();
    await expect(main.getByRole("progressbar", { name: "Your Ship Health", exact: true })).toHaveAttribute("aria-valuenow", "63");
    await expect(main.getByRole("link", { name: "Back to The Harbor", exact: true })).toHaveCount(0);
    await page.goBack();
    await expect(page).toHaveURL(lockedUrl);
    await expect(main.getByRole("button", { name: /^Board Give up/ })).toBeVisible();
    for (const destination of ["/harbor", "/harbor/crew-training", "/characters/" + d.id, "/login", "/combatlog/" + battleId]) {
      await page.goto(destination);
      await expect(page).toHaveURL(lockedUrl);
    }
    const extra = await page.context().newPage();
    await extra.goto("/harbor/ship-upgrades");
    await expect(extra).toHaveURL(lockedUrl);
    await extra.close();
    expect((await a.api.rpc("train_crew", { stat: "attack", expected_tier_id: "crew_1", request_id: randomUUID() })).error?.message).toBe("IN_COMBAT");
    await main.getByRole("button", { name: /^Board Give up/ }).click();
    await expect(main.getByRole("button", { name: /^Crew attack Attack/ })).toBeVisible();
    await expect(main.locator(".o-combat-stage")).toHaveAttribute("data-phase", "boarding");
    await expect(scene).toHaveAttribute("alt", "Two pirate crews clash across the decks of their ships.");
    await expect.poll(() => scene.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    await page.screenshot({ path: ".local/attack-boarding-desktop.jpg", type: "jpeg", quality: 80, fullPage: true });
    await page.setViewportSize({ width: 375, height: 1050 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: ".local/attack-boarding-mobile.jpg", type: "jpeg", quality: 80, fullPage: true });
    await page.setViewportSize({ width: 1280, height: 1050 });
    await main.getByRole("button", { name: /^Crew attack Attack/ }).click();
    await expect(main.getByText("Round 2 / 25", { exact: true })).toBeVisible();
    const persisted = await a.api.rpc("get_combat", { battle_id: battleId });
    expect(persisted.error).toBeNull();
    expect(persisted.data?.events.filter(e => e.kind === "round")).toHaveLength(2);
    expect(JSON.stringify(persisted.data)).not.toContain("24681357");
    await page.reload();
    await expect(main.getByText("Round 2 / 25", { exact: true })).toBeVisible();
    await main.getByRole("button", { name: /^Disengage Take/ }).click();
    await expect(main.getByRole("button", { name: /^Fire cannons 1 salvo/ })).toBeVisible();
    await expect(main.locator(".o-combat-stage")).toHaveAttribute("data-phase", "sea");
    await expect(scene).toHaveAttribute("alt", "Two sailing ships face each other on the open sea.");
    await expect.poll(() => scene.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    await page.screenshot({ path: ".local/attack-sea-desktop.jpg", type: "jpeg", quality: 85, fullPage: true });
    await main.getByRole("button", { name: /^Fire cannons 1 salvo/ }).click();
    await expect(main.getByText("Round 4 / 25", { exact: true })).toBeVisible();
    await page.screenshot({ path: ".local/attack-active-desktop.jpg", type: "jpeg", quality: 75, fullPage: true });
    for (const width of [1680, 1024, 800, 768, 600, 375, 320]) {
      await page.setViewportSize({ width, height: 1050 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(main.getByRole("button", { name: /^Retreat Take/ })).toBeEnabled();
      if (width === 1680) await page.screenshot({ path: ".local/attack-wide-desktop.jpg", type: "jpeg", quality: 85, fullPage: true });
      if (width === 375) await page.screenshot({ path: ".local/attack-mobile.jpg", type: "jpeg", quality: 75, fullPage: true });
    }
    await main.getByRole("button", { name: /^Retreat Take/ }).click();
    await expect(page).toHaveURL(new RegExp("/combatlog/" + battleId + "$"));
    expect((await a.api.rpc("get_attack_lock")).data).toBeNull();
    const anonymous = await browser.newContext();
    try {
      const tab = await anonymous.newPage();
      await tab.goto(localAppUrl + "/combatlog/" + battleId);
      await expect(tab.getByRole("heading", { name: "People (2)", exact: true })).toBeVisible();
      await expect(tab.getByRole("heading", { name: "Combat log", exact: true }).first()).toBeVisible();
      const log = tab.getByRole("region", { name: "Combat log", exact: true });
      await expect(log.getByText(/round/i)).toHaveCount(0);
      await expect(log.getByText("Server time (UTC)", { exact: true })).toBeVisible();
      const report = (await client().rpc("get_combat_log", { battle_id: battleId })).data!;
      for (const event of report.events) {
        const time = log.locator("time").filter({ hasText: new Date(event.at).toLocaleTimeString("en-GB", { timeZone: "UTC" }) });
        expect(await time.count()).toBeGreaterThan(0);
      }
      for (const person of report.people) {
        const entry = tab.locator(".o-combat-people li").filter({ has: tab.getByRole("link", { name: person.name, exact: true }) });
        await expect(entry.locator("dl > div").filter({ hasText: "Ship damage" }).locator("dd")).toHaveText(String(person.ship_damage));
        await expect(entry.locator("dl > div").filter({ hasText: "Crew damage" }).locator("dd")).toHaveText(String(person.crew_damage));
        expect(await tab.getByText(person.name, { exact: true }).evaluateAll(
          (elements, href) => elements.length > 0 && elements.every(element => element.closest("a")?.getAttribute("href") === href),
          "/players/" + person.player_number,
        )).toBe(true);
      }
      await tab.screenshot({ path: ".local/combat-public-log.jpg", type: "jpeg", quality: 75, fullPage: true });
    } finally { await anonymous.close(); }
    await page.getByRole("link", { name: "Back to The Harbor", exact: true }).click();
    await expect(page).toHaveURL(/\/harbor$/);
    expect(errors).toEqual([]);
  } finally { await cleanup([a, d]); }
});

test("simultaneous starts join once; duplicate orders, independent phases, timeout and final-hit races stay atomic", async () => {
  const a = await captain(), d = await captain(), b = await captain();
  try {
    sql("update public.characters set ship_defense=1000000,crew_defense=1000000,ship_accuracy=1000000,crew_accuracy=1000000 where id in('" + a.id + "','" + b.id + "')");
    const starts = await Promise.all([start(a.api, d.id, randomUUID()), start(b.api, d.id, randomUUID())]);
    expect(starts.every(result => !result.error)).toBe(true);
    const id = battle(starts[0].data).id;
    expect(battle(starts[1].data).id).toBe(id);
    const requestId = randomUUID();
    const rounds = await Promise.all([0, 1].map(() => a.api.rpc("submit_combat_order", { battle_id: id, expected_round: 0, player_order: "fire", request_id: requestId })));
    for (const round of rounds) {
      expect(round.error).toBeNull();
      expect(battle(round.data).events.filter(e => e.kind === "round")).toHaveLength(1);
    }
    expect((await a.api.rpc("get_game_state")).data?.energy).toBe(90);
    expect((await b.api.rpc("get_game_state")).data?.energy).toBe(90);
    expect((await b.api.rpc("get_combat", { battle_id: id })).data?.round).toBe(0);
    sql("update private.combat_participants set phase='boarding' where combat_id='" + uuid(id) + "' and character_id='" + a.id + "'");
    sql("update private.combats set state=jsonb_set(jsonb_set(state,'{defender,ship_health}','1'),'{defender,crew_health}','1') where id='" + id + "'");
    sql("update public.characters set ship_health=1,crew_health=1 where id='" + d.id + "'");
    let finished = false;
    for (let i = 0; i < 10 && !finished; i++) {
      const currentA = (await a.api.rpc("get_combat", { battle_id: id })).data!;
      const currentB = (await b.api.rpc("get_combat", { battle_id: id })).data!;
      const results = await Promise.all([
        a.api.rpc("submit_combat_order", { battle_id: id, expected_round: currentA.round, player_order: "crew_attack", request_id: randomUUID() }),
        b.api.rpc("submit_combat_order", { battle_id: id, expected_round: currentB.round, player_order: "fire", request_id: randomUUID() }),
      ]);
      expect(results.every(r => !r.error)).toBe(true);
      const latest = (await a.api.rpc("get_combat", { battle_id: id })).data!;
      finished = latest.status === "completed";
      if (finished) {
        expect(latest.people.filter(p => p.status === "victory")).toHaveLength(1);
        expect(latest.people.filter(p => p.status === "assist")).toHaveLength(1);
        expect(latest.events.filter(e => e.participant_result === "victory")).toHaveLength(1);
        expect(latest.defender.crew_health).toBe(0);
      }
    }
    expect(finished).toBe(true);
    expect((await a.api.rpc("get_attack_lock")).data).toBeNull();
    expect((await b.api.rpc("get_attack_lock")).data).toBeNull();
    expect((await client().rpc("get_combat_log", { battle_id: id })).data?.people).toHaveLength(3);
  } finally { await cleanup([a, d, b]); }
});

test("joined attackers and an online defender receive shared HP live; the defender stays in the harbor", async ({ page, browser }) => {
  const a = await captain(), b = await captain(), d = await captain();
  const contextB = await browser.newContext(), contextD = await browser.newContext();
  const pageB = await contextB.newPage(), pageD = await contextD.newPage();
  try {
    sql("update public.characters set ship_defense=1000000,crew_defense=1000000,ship_accuracy=1000000,crew_accuracy=1000000 where id in('" + a.id + "','" + b.id + "')");
    await login(page, a);
    await login(pageB, b);
    await login(pageD, d);
    await page.goto("/attack/" + d.playerNumber);
    const sharedUrl = page.url();
    await page.getByRole("button", { name: "Start battle 10 Energy", exact: true }).click();
    await expect(page.getByRole("button", { name: /^Fire cannons 1 salvo/ })).toBeVisible();
    await expect(page).toHaveURL(sharedUrl);
    const id = uuid((await a.api.rpc("get_attack_lock")).data!.battle_id);
    await pageB.goto(sharedUrl);
    const ownB = pageB.getByRole("region", { name: "Your ship and crew", exact: true });
    await expect(ownB.getByRole("link", { name: b.name, exact: true })).toBeVisible();
    await expect(pageB.getByRole("region", { name: "Opponent ship and crew", exact: true }).getByText("Unknown", { exact: true })).toHaveCount(2);
    expect((await b.api.rpc("get_game_state")).data?.energy).toBe(100);
    await expect(pageB.getByRole("button", { name: "Join battle 10 Energy", exact: true })).toBeEnabled();
    await pageB.getByRole("button", { name: "Join battle 10 Energy", exact: true }).click();
    await expect(pageB.getByRole("button", { name: /^Fire cannons 1 salvo/ })).toBeVisible();
    await expect(pageB).toHaveURL(sharedUrl);
    expect((await b.api.rpc("get_attack_lock")).data?.battle_id).toBe(id);
    expect((await b.api.rpc("get_game_state")).data?.energy).toBe(90);
    await pageB.reload();
    await expect(ownB.getByRole("link", { name: b.name, exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "People (3)", exact: true })).toBeVisible({ timeout: 10000 });
    sql("update private.combat_participants set phase='boarding' where combat_id='" + id + "' and character_id='" + a.id + "'");
    await page.reload();
    await expect(page.getByRole("button", { name: /^Crew attack Attack/ })).toBeVisible();
    let current = (await b.api.rpc("get_combat", { battle_id: id })).data!;
    for (let i = 0; i < 10 && current.defender.ship_health === 100; i++) {
      await pageB.getByRole("button", { name: /^Fire cannons 1 salvo/ }).click();
      await expect(pageB.getByText("Round " + (current.round + 1) + " / 25", { exact: true })).toBeVisible();
      current = (await b.api.rpc("get_combat", { battle_id: id })).data!;
    }
    expect(current.defender.ship_health).toBeLessThan(100);
    await expect(page.getByRole("progressbar", { name: "Opponent Ship Health", exact: true })).toHaveAttribute("aria-valuenow", String(current.defender.ship_health), { timeout: 10000 });
    await expect(pageD.getByRole("progressbar", { name: "Ship Health", exact: true })).toHaveAttribute("aria-valuenow", String(current.defender.ship_health), { timeout: 10000 });
    await expect(pageD).toHaveURL(/\/harbor$/);
    await pageD.getByRole("link", { name: "Crew Training", exact: true }).click();
    await expect(pageD).toHaveURL(/\/harbor\/crew-training$/);
    await expect(pageD.getByRole("button", { name: /Train Attack/ })).toBeDisabled();
    await page.getByRole("button", { name: /^Retreat Take/ }).click();
    await expect(page.getByRole("heading", { name: "You withdrew", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Back to The Harbor", exact: true }).first().click();
    await expect(page).toHaveURL(/\/harbor$/);
    expect((await b.api.rpc("get_attack_lock")).data?.battle_id).toBe(id);
    await pageB.getByRole("button", { name: /^Retreat Take/ }).click();
    await expect(pageB).toHaveURL(new RegExp("/combatlog/" + id + "$"));
  } finally {
    await contextB.close();
    await contextD.close();
    await cleanup([a, b, d]);
  }
});

test("a shared victory opens the same report for both attackers and the target link can be opened again", async ({ page, browser }) => {
  const a = await captain(), b = await captain(), d = await captain();
  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  try {
    sql("update public.characters set ship_defense=1000000,ship_accuracy=1000000 where id in('" + a.id + "','" + b.id + "')");
    await login(page, a);
    await login(pageB, b);
    await page.goto("/attack/" + d.playerNumber);
    const sharedUrl = page.url();
    await page.getByRole("button", { name: "Start battle 10 Energy", exact: true }).click();
    await expect(page.getByRole("button", { name: /^Fire cannons 1 salvo/ })).toBeVisible();
    const id = uuid((await a.api.rpc("get_attack_lock")).data!.battle_id);
    await pageB.goto(sharedUrl);
    await pageB.getByRole("button", { name: "Join battle 10 Energy", exact: true }).click();
    await expect(pageB.getByRole("button", { name: /^Fire cannons 1 salvo/ })).toBeVisible();
    sql("update private.combats set state=jsonb_set(state,'{defender,ship_health}','1') where id='" + id + "'");
    sql("update public.characters set ship_health=1 where id='" + d.id + "'");
    for (let i = 0; i < 10; i++) {
      await pageB.getByRole("button", { name: /^Fire cannons 1 salvo/ }).click();
      let current = (await b.api.rpc("get_combat", { battle_id: id })).data!;
      await expect.poll(async () => {
        current = (await b.api.rpc("get_combat", { battle_id: id })).data!;
        return current.status === "completed" || current.round > i;
      }).toBe(true);
      if (current.status === "completed") break;
      await expect(pageB.getByText("Round " + current.round + " / 25", { exact: true })).toBeVisible();
    }
    await expect(pageB).toHaveURL(new RegExp("/combatlog/" + id + "$"));
    await expect(page).toHaveURL(pageB.url());
    const people = page.getByRole("region", { name: "People (3)", exact: true });
    await expect(people.locator('[data-result="victory"]').getByRole("link", { name: b.name, exact: true })).toBeVisible();
    await expect(people.locator('[data-result="assist"]').getByRole("link", { name: a.name, exact: true })).toBeVisible();
    await page.goto(sharedUrl);
    await expect(page).toHaveURL(sharedUrl);
    await expect(page.getByRole("button", { name: "Start battle 10 Energy", exact: true })).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL(sharedUrl);
    await expect(page.getByRole("region", { name: "Opponent ship and crew", exact: true }).getByText("Unknown", { exact: true })).toHaveCount(2);
    await page.goto("/attack?target=" + d.id + "&battle=" + id);
    await expect(page).toHaveURL(sharedUrl);
    await expect(page.getByRole("button", { name: "Start battle 10 Energy", exact: true })).toBeVisible();
  } finally {
    await contextB.close();
    await cleanup([a, b, d]);
  }
});

test("extreme stats distinguish guaranteed misses from blocked hits in sea and crew combat", async ({ page }) => {
  const a = await captain(), d = await captain();
  try {
    sql("update public.characters set ship_speed=64,crew_speed=64,ship_defense=25,crew_defense=25 where id in('" + a.id + "','" + d.id + "')");
    sql("update public.characters set ship_accuracy=4096,crew_accuracy=4096 where id='" + d.id + "'");
    await login(page, a);
    await page.goto("/attack/" + d.playerNumber);
    await page.getByRole("button", { name: "Start battle 10 Energy", exact: true }).click();
    await page.getByRole("button", { name: /^Fire cannons 1 salvo/ }).click();
    await expect(page.getByText("Round 1 / 25", { exact: true })).toBeVisible();
    const id = uuid((await a.api.rpc("get_attack_lock")).data!.battle_id);
    const log = page.getByRole("region", { name: "Combat log", exact: true });
    await expect(log.getByText("Missed", { exact: true })).toHaveCount(1);
    await expect(log.getByText("Blocked · 0 damage", { exact: true })).toHaveCount(1);
    expect((await a.api.rpc("get_combat", { battle_id: id })).data?.attacker.ammo).toBe(9);

    sql("update private.combat_participants set phase='boarding' where combat_id='" + id + "' and character_id='" + a.id + "'");
    await page.reload();
    await page.getByRole("button", { name: /^Crew attack Attack/ }).click();
    await expect(page.getByText("Round 2 / 25", { exact: true })).toBeVisible();
    await expect(log.getByText("Missed", { exact: true })).toHaveCount(2);
    await expect(log.getByText("Blocked · 0 damage", { exact: true })).toHaveCount(2);
    for (const resource of ["Your Ship Health", "Your Crew Health"]) {
      await expect(page.getByRole("progressbar", { name: resource, exact: true })).toHaveAttribute("aria-valuenow", "100");
    }
    await page.getByRole("button", { name: /^Retreat Take/ }).click();
    await expect(page).toHaveURL(new RegExp("/combatlog/" + id + "$"));
    await expect(log.getByText("Missed", { exact: true })).toHaveCount(2);
    await expect(log.getByText("Blocked · 0 damage", { exact: true })).toHaveCount(3);
    const report = (await client().rpc("get_combat_log", { battle_id: id })).data!;
    expect(report.people.find(person => person.id === a.id)).toMatchObject({ hits: 0, ship_damage: 0, crew_damage: 0 });
    expect(report.people.find(person => person.id === d.id)).toMatchObject({ hits: 3, ship_damage: 0, crew_damage: 0 });
  } finally { await cleanup([a, d]); }
});

