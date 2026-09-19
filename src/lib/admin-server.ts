import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { requireUser, currentUser } from "@/lib/player";
import { createClient } from "@/lib/supabase/server";
import type { AdminPage } from "@/lib/admin";

export const currentUserIsAdmin = cache(async () => {
  if (!await currentUser()) return false;
  const client = await createClient();
  const { data, error } = await client.rpc("is_admin");
  if (error) throw new Error("Administrator access could not be verified.");
  return data === true;
});

export async function requireAdmin() {
  await requireUser();
  if (!await currentUserIsAdmin()) notFound();
}

export const adminCatalog = cache(async () => {
  await requireAdmin();
  const { data, error } = await (await createClient()).rpc("admin_catalog");
  if (error || !data) throw new Error("The admin catalog could not be loaded.");
  return data;
});

export async function readAdminTable(resource: string, search = "", page = 0, filters: Record<string, string | null> = {}): Promise<AdminPage> {
  await requireAdmin();
  const { data, error } = await (await createClient()).rpc("admin_read", {
    resource, search_term: search, requested_page: page, filters,
  });
  if (error || !data) throw new Error("The database records could not be loaded.");
  return data;
}


export async function activeAdminItemDefinitions() {
  const first = await readAdminTable("item_definitions", "", 0, { active: "true" });
  const rows = [...first.rows];
  for (let page = 1; BigInt(page * first.page_size) < BigInt(first.total); page++) {
    const next = await readAdminTable("item_definitions", "", page, { active: "true" });
    if (next.page !== page) break;
    rows.push(...next.rows);
  }
  return rows;
}
