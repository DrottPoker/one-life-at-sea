import Link from "next/link";
import { notFound } from "next/navigation";
import { adminCatalog, readAdminTable } from "@/lib/admin-server";
import { adminLabel, adminResourceGroup, adminPageNumber } from "@/lib/admin";
import { DatabaseTable, AdminPagination } from "@/components/admin/database-table";

export default async function AdminDatabase({ params, searchParams }: {
  params: Promise<{ resource: string }>;
  searchParams: Promise<{ q?: string; page?: string; field?: string; value?: string }>;
}) {
  const [{ resource: name }, query, catalog] = await Promise.all([params, searchParams, adminCatalog()]);
  const resource = catalog.find(entry => entry.name === name);
  if (!resource) notFound();
  const search = (query.q ?? "").slice(0, 200);
  const field = resource.columns.some(column => column.name === query.field) ? query.field! : "";
  const value = (query.value ?? "").slice(0, 500);
  const data = await readAdminTable(name, search, adminPageNumber(query.page), field && value ? { [field]: value } : {});
  return <div className="admin-database"><aside><h2>Database browser</h2><nav aria-label="Database tables">{["Players and inventory", "Game content", "Combat and travel", "History and receipts", "Audit and access"].map(group => <details key={group} open={adminResourceGroup(name) === group}><summary>{group}</summary>{catalog.filter(entry => adminResourceGroup(entry.name) === group).map(entry =>
    <Link key={entry.name} href={"/admin/database/" + entry.name} aria-current={entry.name === name ? "page" : undefined}>{adminLabel(entry.name)}</Link>)}</details>)}</nav></aside>
    <section><h2>{adminLabel(resource.name)}</h2><small>{resource.schema}.{resource.table}</small><p>{resource.note}</p>{resource.name === "item_definitions" && <Link href="/admin/items">Open item editor</Link>}{["loot_tables", "loot_entries"].includes(resource.name) && <Link href="/admin/loot">Open loot table editor</Link>}{resource.name === "activity_loot" && <Link href="/admin/activities">Open activity settings</Link>}
      <form className="admin-search"><label>Search records<input name="q" defaultValue={search} maxLength={200} /></label>
        <label>Exact column<select name="field" defaultValue={field}><option value="">All columns</option>{resource.columns.map(column => <option key={column.name}>{column.name}</option>)}</select></label>
        <label>Exact value<input name="value" defaultValue={value} maxLength={500} /></label><button>Search</button>
        <Link href={"/admin/database/" + name}>Clear</Link></form>
      <p>{data.total} record(s) · {resource.editable.length ? "Editable: " + resource.editable.join(", ") : "Read-only"}</p>
      <DatabaseTable resource={resource} data={data} /><AdminPagination data={data} href={"/admin/database/" + name} search={search} filters={{ field, value }} />
    </section></div>;
}

