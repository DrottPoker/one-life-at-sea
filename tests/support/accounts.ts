import { expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
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
  const name = "Captain " + tag;
  const signup = await api.auth.signUp({ email, password, options: { data: { character_name: name, ...metadata } } });
  expect(signup.error).toBeNull();
  const own = await api.from("characters").select("id").single();
  expect(own.error).toBeNull();
  const id = own.data!.id, userId = signup.data.user!.id;
  if (![id, userId].every(value => /^[0-9a-f-]{36}$/.test(value))) throw new Error("Invalid fixture ID.");
  return { api, id, userId, email, password, name };
}

type TestAccount = Awaited<ReturnType<typeof createTestAccount>>;

export async function loginTestAccount(page: Page, account: Pick<TestAccount, "email" | "password">, hospital = false) {
  await page.goto("/login");
  await page.getByLabel("Email address", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(hospital ? /\/harbor\/hospital$/ : /\/harbor$/);
}

export async function cleanupTestAccounts(accounts: TestAccount[]) {
  for (const account of accounts) {
    if (!/^[0-9a-f-]{36}$/.test(account.userId)) throw new Error("Invalid cleanup ID.");
    await account.api.auth.signOut();
    testSql("delete from auth.users where id='" + account.userId + "'");
  }
}
