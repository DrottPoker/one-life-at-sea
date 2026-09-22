import Link from "next/link";
import { Plus } from "lucide-react";
import { readAdminTable } from "@/lib/admin-server";
import { adminPageNumber } from "@/lib/admin";
import { AdminPagination } from "@/components/admin/database-table";

export default async function AdminLoot({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const params = await searchParams, search = (params.q ?? "").slice(0, 200);
  const data = await readAdminTable("loot_tables", search, adminPageNumber(params.page));
  return <><div className="admin-page-heading"><div><h2>Loot tables</h2><p>Build reusable collections of possible rewards, then assign them to activities.</p></div><Link className="admin-primary-link" href="/admin/loot/new"><Plus size={18} aria-hidden="true" />Create loot table</Link></div>
    <form className="admin-search"><label>Search loot tables<input name="q" maxLength={200} defaultValue={search} placeholder="Table name or ID" /></label><button>Search</button><Link href="/admin/loot">Clear</Link></form>
    <div className="admin-item-grid">{data.rows.map(row => <Link key={row.values.id} href={"/admin/loot/" + row.values.id} className="admin-item-card"><div><strong>{row.values.name}</strong><p>{row.values.description || "No description yet."}</p><small>{row.values.id}</small></div><span className="admin-badge">{row.values.active === "true" ? "Active" : "Disabled"}</span></Link>)}</div>
    {!data.rows.length && <div className="admin-empty"><h3>No loot tables found</h3><p>Create a table, add some items, then connect it to Shore Fishing.</p></div>}
    <AdminPagination data={data} href="/admin/loot" search={search} />
    <div className="admin-help"><strong>How it works</strong><p>Catch success → fixed item chances → weighted items. A fixed 1% means 1 in 100 successful catches on average, at every skill level.</p><Link href="/admin/activities">Assign tables to activities</Link></div>
  </>;
}
