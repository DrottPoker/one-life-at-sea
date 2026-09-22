import Link from "next/link";
import { notFound } from "next/navigation";
import { readAllAdminRows, requireAdmin } from "@/lib/admin-server";
import { createClient } from "@/lib/supabase/server";
import { LootEditor } from "@/components/admin/loot-editor";

export default async function AdminLootTable({ params }: { params: Promise<{ lootId: string }> }) {
  await requireAdmin();
  const { lootId } = await params;
  const [items, result] = await Promise.all([readAllAdminRows("item_definitions"), lootId === "new" ? null : (await createClient()).rpc("admin_get_loot_table", { target_id: lootId })]);
  if (result?.error) throw new Error("The loot table could not be loaded.");
  if (lootId !== "new" && !result?.data) notFound();
  const table = result?.data ?? undefined;
  return <><Link href="/admin/loot">Loot tables</Link><div className="admin-page-heading"><div><h2>{table ? "Edit " + table.name : "Create loot table"}</h2><p>Changes are shared by every activity using this table.</p></div></div><LootEditor key={table?.version ?? "new"} table={table} items={items} /></>;
}
