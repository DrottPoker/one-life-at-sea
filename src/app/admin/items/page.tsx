import Link from "next/link";
import { Plus } from "lucide-react";
import { readAdminTable } from "@/lib/admin-server";
import { adminPageNumber } from "@/lib/admin";
import { inventoryCategoryName } from "@/lib/inventory";
import { ItemImage } from "@/components/inventory/item-image";
import { AdminPagination } from "@/components/admin/database-table";
import { DEFAULT_ITEM_IMAGE } from "@/lib/loot";

export default async function AdminItems({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; status?: string }> }) {
  const params = await searchParams, search = (params.q ?? "").slice(0, 200);
  const status = ["active", "disabled"].includes(params.status ?? "") ? params.status! : "";
  const data = await readAdminTable("item_definitions", search, adminPageNumber(params.page), status ? { active: String(status === "active") } : {});
  return <><div className="admin-page-heading"><div><h2>Items</h2><p>Create and edit the items players can collect and trade.</p></div><Link className="admin-primary-link" href="/admin/items/new"><Plus size={18} aria-hidden="true" />Create item</Link></div>
    <form className="admin-search"><label>Search items<input name="q" defaultValue={search} placeholder="Item name or ID" maxLength={200} /></label>
      <label>Status<select name="status" defaultValue={status}><option value="">All items</option><option value="active">Active</option><option value="disabled">Disabled</option></select></label><button>Search</button><Link href="/admin/items">Clear</Link></form>
    <p className="admin-muted">{data.total} item(s)</p><div className="admin-item-grid">{data.rows.map(row => <Link className="admin-item-card" href={"/admin/items/" + row.values.id} key={row.values.id}>
      <ItemImage item={{ name: row.values.name!, image_path: row.values.image_path ?? DEFAULT_ITEM_IMAGE }} />
      <div><strong>{row.values.name}</strong><small>{inventoryCategoryName(row.values.category_id)} · {row.values.stackable === "true" ? "Stackable" : "Equipment"}</small><p>{row.values.description}</p></div>
      <span className={row.values.active === "true" ? "admin-badge" : "admin-badge admin-badge-muted"}>{row.values.active === "true" ? "Active" : "Disabled"}</span>
    </Link>)}</div>{!data.rows.length && <div className="admin-empty"><h3>No items found</h3><p>Try another search or create your first item.</p><Link href="/admin/items/new">Create item</Link></div>}
    <AdminPagination data={data} href="/admin/items" search={search} filters={{ status }} />
  </>;
}
