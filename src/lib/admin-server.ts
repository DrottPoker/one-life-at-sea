import "server-only";
import { cache } from "react";
import { playerContext } from "@/lib/player-context";
import { notFound } from "next/navigation";
import { requireUser, currentUser } from "@/lib/player";
import { createClient } from "@/lib/supabase/server";
import type { AdminPage } from "@/lib/admin";

export const currentUserIsAdmin = cache(async () => {
  if (!await currentUser()) return false;
  return (await playerContext()).is_admin;
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


export async function readAllAdminRows(resource: string, filters: Record<string, string | null> = {}) {
  const first = await readAdminTable(resource, "", 0, filters);
  const rows = [...first.rows];
  for (let page = 1; BigInt(page * first.page_size) < BigInt(first.total); page++) {
    const next = await readAdminTable(resource, "", page, filters);
    if (next.page !== page) break;
    rows.push(...next.rows);
  }
  return rows;
}

export const activeAdminItemDefinitions = () => readAllAdminRows("item_definitions", { active: "true" });
