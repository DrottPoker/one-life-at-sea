import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { cleanupTestAccounts, createTestAccount, loginTestAccount, testSql } from "../support/accounts";
import type { CombatResponse } from "../../src/lib/combat";

function battleId(result: CombatResponse | null) {
  expect(result).not.toBeNull();
  if (!result || "error" in result) throw new Error("Expected a started battle.");
  return result.battle.id;
}

test("group attack creates one live notification with every attacker, Hospital outcome and combat log", async ({ page, context }) => {
  const own = await createTestAccount("notification-defender");
  const first = await createTestAccount("notification-first");
  const second = await createTestAccount("notification-second");
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    testSql(`update public.characters set ship_health=1,ship_recovery_at=clock_timestamp()+interval '1 day',ship_accuracy=1 where id='${own.id}';
      update public.characters set ship_accuracy=100000,ship_speed=100000 where id in ('${first.id}','${second.id}');`);
    await loginTestAccount(page, own);
    await page.getByRole("link", { name: "Notifications, 0 unread", exact: true }).click();
    await expect(page.getByText("No notifications yet. Your events will appear here.")).toBeVisible();
    const started = await first.api.rpc("start_combat", { target_id: own.id, request_id: randomUUID() });
    expect(started.error).toBeNull();
    const id = battleId(started.data);
    const joined = await second.api.rpc("start_combat", { target_id: own.id, request_id: randomUUID() });
    expect(battleId(joined.data)).toBe(id);
    const retreat = await first.api.rpc("submit_combat_order", { battle_id: id, expected_round: 0, player_order: "retreat", request_id: randomUUID() });
    expect(retreat.error).toBeNull();
    expect((await own.api.rpc("get_notification_summary")).data!.unread_count).toBe(0);
    const request_id = randomUUID();
    const finished = await second.api.rpc("submit_combat_order", { battle_id: id, expected_round: 0, player_order: "fire", request_id });
    expect(finished.error).toBeNull();
    await second.api.rpc("submit_combat_order", { battle_id: id, expected_round: 0, player_order: "fire", request_id });
    await expect(page.getByRole("link", { name: "Notifications, 1 unread", exact: true })).toBeVisible();
    await page.getByRole("navigation", { name: "Harbor locations" }).getByRole("link", { name: "Hospital", exact: true }).click();
    await expect(page).toHaveURL(/\/harbor\/hospital$/);
    await page.getByRole("link", { name: "Notifications, 1 unread", exact: true }).click();
    const inbox = page.getByRole("list", { name: "Notifications", exact: true });
    await expect(inbox.getByRole("listitem")).toHaveCount(1);
    await expect(inbox).toContainText(`${first.name} and ${second.name} attacked and hospitalized you`);
    await expect(inbox.getByRole("link", { name: first.name, exact: true })).toHaveAttribute("href", "/players/" + first.playerNumber);
    await expect(inbox.getByRole("link", { name: second.name, exact: true })).toHaveAttribute("href", "/players/" + second.playerNumber);
    await expect(inbox.getByRole("link", { name: "View combat log" })).toHaveAttribute("href", "/combatlog/" + id);
    for (const width of [1440, 375, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(inbox.getByRole("link", { name: "View combat log" })).toBeVisible();
      if (width !== 320) await page.screenshot({ path: `.local/notifications-${width}.jpg`, type: "jpeg", quality: 65, fullPage: true });
    }
    const otherTab = await context.newPage();
    try {
      await otherTab.goto("/notifications");
      await expect(otherTab.getByRole("link", { name: "Notifications, 1 unread", exact: true })).toBeVisible();
      await inbox.getByRole("link", { name: "View combat log" }).click();
      await expect(page).toHaveURL(new RegExp("/combatlog/" + id + "$"));
      await expect(otherTab.getByRole("link", { name: "Notifications, 0 unread", exact: true })).toBeVisible();
      await expect(otherTab.getByLabel("Read", { exact: true })).toBeVisible();
    } finally { await otherTab.close(); }
    await page.getByRole("link", { name: "Notifications, 0 unread", exact: true }).click();
    await expect(page).toHaveURL(/\/notifications$/);
    await expect(page.getByLabel("Read", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Read", { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  } finally { await page.goto("about:blank"); await cleanupTestAccounts([own, first, second]); }
});

test("offline attacks persist and an inbox can page through older notifications and mark all read", async ({ page }) => {
  const own = await createTestAccount("notification-offline");
  const attacker = await createTestAccount("notification-attacker");
  try {
    testSql(`update public.characters set ship_accuracy=1 where id='${own.id}';
      update public.characters set ship_speed=100000 where id='${attacker.id}';`);
    const started = await attacker.api.rpc("start_combat", { target_id: own.id, request_id: randomUUID() });
    const id = battleId(started.data);
    const finished = await attacker.api.rpc("submit_combat_order", { battle_id: id, expected_round: 0, player_order: "retreat", request_id: randomUUID() });
    expect(finished.error).toBeNull();
    await page.goto("/notifications");
    await expect(page).toHaveURL(/\/login$/);
    await loginTestAccount(page, own);
    await page.getByRole("link", { name: "Notifications, 1 unread", exact: true }).click();
    await expect(page.getByRole("list", { name: "Notifications", exact: true })).toContainText(attacker.name + " attacked you");
    testSql(`select private.emit_notification('${own.id}','test.future','browser-'||n,jsonb_build_object('value',n)) from generate_series(1,22) n;`);
    await expect(page.getByRole("link", { name: "Notifications, 23 unread", exact: true })).toBeVisible();
    await expect(page.getByRole("list", { name: "Notifications", exact: true }).getByRole("listitem")).toHaveCount(20);
    await page.getByRole("link", { name: "Older notifications", exact: true }).click();
    await expect(page.getByRole("list", { name: "Notifications", exact: true }).getByRole("listitem")).toHaveCount(3);
    await expect(page.getByRole("link", { name: "View combat log" })).toHaveAttribute("href", "/combatlog/" + id);
    await page.getByRole("button", { name: "Mark all as read", exact: true }).click();
    await expect(page.getByRole("link", { name: "Notifications, 0 unread", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Latest notifications", exact: true }).click();
    await expect(page.getByRole("button", { name: "Mark all as read", exact: true })).toBeDisabled();
    await page.reload();
    await expect(page.getByRole("link", { name: "Notifications, 0 unread", exact: true })).toBeVisible();
  } finally { await page.goto("about:blank"); await cleanupTestAccounts([own, attacker]); }
});

test("a defeated attacker is shown as having lost in the defender notification", async ({ page }) => {
  const own = await createTestAccount("notification-victor");
  const attacker = await createTestAccount("notification-loser");
  try {
    testSql(`update public.characters set ship_accuracy=100000,ship_speed=100000 where id='${own.id}';
      update public.characters set ship_health=1,ship_recovery_at=clock_timestamp()+interval '1 day',ship_accuracy=1 where id='${attacker.id}';`);
    await loginTestAccount(page, own);
    const started = await attacker.api.rpc("start_combat", { target_id: own.id, request_id: randomUUID() });
    const id = battleId(started.data);
    const finished = await attacker.api.rpc("submit_combat_order", { battle_id: id, expected_round: 0, player_order: "fire", request_id: randomUUID() });
    expect(finished.error).toBeNull();
    expect(finished.data).toMatchObject({ battle: { outcome: "defended" } });
    await page.getByRole("link", { name: "Notifications, 1 unread", exact: true }).click();
    const inbox = page.getByRole("list", { name: "Notifications", exact: true });
    await expect(inbox).toContainText(attacker.name + " attacked you but lost");
    await expect(inbox.getByRole("link", { name: "View combat log" })).toHaveAttribute("href", "/combatlog/" + id);
    await page.reload();
    await expect(inbox).toContainText(attacker.name + " attacked you but lost");
  } finally { await page.goto("about:blank"); await cleanupTestAccounts([own, attacker]); }
});
