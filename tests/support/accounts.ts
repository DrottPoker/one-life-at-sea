import { expect, type Page, type BrowserContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { isUuid } from "../../src/lib/validation";
import type { Database } from "../../src/lib/database.types";
import { isLocalTestApi, localDatabaseContainer } from "./local";

process.loadEnvFile(".env.local");
const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const apiKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
if (!isLocalTestApi(apiUrl)) throw new Error("Test accounts require local Supabase.");

export function createTestClient() {
  return createClient<Database>(apiUrl, apiKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function testSql(statement: string): string {
  return execFileSync("docker", ["exec", "-i", localDatabaseContainer, "psql", "-U", "postgres", "-d", "postgres",
    "-v", "ON_ERROR_STOP=1", "-q", "-t", "-A"],
  { input: statement, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
}

export async function createTestAccount(prefix: string, metadata: Record<string, unknown> = {}) {
  const api = createTestClient(), tag = randomBytes(10).toString("hex");
  const email = prefix + "-" + tag + "@example.test", password = randomBytes(24).toString("hex");
  const name = "Captain" + tag.replace(/[0-9]/g, digit => String.fromCharCode(103 + Number(digit)));
  const signup = await api.auth.signUp({ email, password, options: { data: { character_name: name, ...metadata } } });
  expect(signup.error).toBeNull();
  const own = await api.from("characters").select("id, player_number").single();
  expect(own.error).toBeNull();
  const id = own.data!.id, userId = signup.data.user!.id;
  if (![id, userId].every(isUuid)) throw new Error("Invalid fixture ID.");
  // Isolate action-cost tests from real clock ticks; recovery tests set explicit past checkpoints.
  testSql("update public.characters set energy_updated_at=clock_timestamp()+interval '1 day',morale_updated_at=clock_timestamp()+interval '1 day' where id='" + id + "';");
  return { api, id, playerNumber: own.data!.player_number, userId, email, password, name };
}

const accountContexts = new Map<string, Set<BrowserContext>>();

type TestAccount = Awaited<ReturnType<typeof createTestAccount>>;

export async function loginTestAccount(page: Page, account: Pick<TestAccount, "email" | "password">, hospital = false) {
  const contexts = accountContexts.get(account.email) ?? new Set<BrowserContext>();
  contexts.add(page.context());
  accountContexts.set(account.email, contexts);
  await page.goto("/login");
  // Confirm client handlers are ready before filling controlled inputs.
  await page.getByRole("button", { name: "Show", exact: true }).click();
  await expect(page.getByRole("button", { name: "Hide", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Hide", exact: true }).click();
  await expect(page.getByRole("button", { name: "Show", exact: true })).toBeVisible();
  await page.getByLabel("Email address", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(hospital ? /\/harbor\/hospital$/ : /\/harbor$/);
}

export function cleanupTestUsers(userIds: string[]) {
  if (!userIds.length) return;
  if (!userIds.every(isUuid)) throw new Error("Invalid cleanup ID.");
  const ids = userIds.map(id => "'" + id + "'::uuid").join(",");
  testSql("do $$ declare statistics_ids bigint[]; begin select array_agg(id) into statistics_ids from private.player_statistics_accounts where user_id=any(array[" + ids + "]); delete from auth.users where id=any(array[" + ids + "]); delete from private.player_statistics_accounts where id=any(statistics_ids); end $$;");
}

export async function cleanupTestAccounts(accounts: TestAccount[]) {
  const contexts = new Set(accounts.flatMap(account => [...(accountContexts.get(account.email) ?? [])]));
  for (const account of accounts) accountContexts.delete(account.email);
  // Stop background reads before deleting this test's accounts.
  await Promise.all([...contexts].flatMap(context => context.pages().map(page => page.close())));
  cleanupTestUsers(accounts.map(account => account.userId));
  await Promise.all(accounts.map(account => account.api.auth.signOut()));
}

export function cleanupTestRegistrations(emails: string[]) {
  if (!emails.length) return;
  if (!emails.every(email => /^[a-z0-9-]+@example\.test$/.test(email))) throw new Error("Invalid registration fixture email.");
  const values = emails.map(email => "'" + email + "'").join(",");
  const ids = testSql("select id from auth.users where email in (" + values + ");").trim();
  if (ids) cleanupTestUsers(ids.split(/\r?\n/));
}
