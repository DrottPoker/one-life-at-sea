import Link from "next/link";
import { notFound } from "next/navigation";
import { readAdminTable, requireAdmin } from "@/lib/admin-server";
import { ItemEditor } from "@/components/admin/item-editor";

export default async function AdminItem({ params }: { params: Promise<{ itemId: string }> }) {
  await requireAdmin();
  const { itemId } = await params;
  const row = itemId === "new" ? undefined : (await readAdminTable("item_definitions", "", 0, { id: itemId })).rows[0];
  if (itemId !== "new" && !row) notFound();
  return <><Link href="/admin/items">Items</Link><div className="admin-page-heading"><div><h2>{row ? "Edit " + row.values.name : "Create item"}</h2><p>Item changes apply immediately. Existing holdings are preserved.</p></div></div><ItemEditor key={row?.version ?? "new"} row={row} /></>;
}
