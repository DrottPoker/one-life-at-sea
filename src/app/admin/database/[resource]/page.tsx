import Link from "next/link";
import { notFound } from "next/navigation";
import { adminCatalog, readAdminTable } from "@/lib/admin-server";
import { adminPageNumber } from "@/lib/admin";
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
  return <div className="admin-database"><aside><h2>Tables</h2><nav aria-label="Database tables">{catalog.map(entry =>
    <Link key={entry.name} href={"/admin/database/" + entry.name} aria-current={entry.name === name ? "page" : undefined}>{entry.name}</Link>)}</nav></aside>
    <section><h2>{resource.schema}.{resource.table}</h2><p>{resource.note}</p>
      <form className="admin-search"><label>Search records<input name="q" defaultValue={search} maxLength={200} /></label>
        <label>Exact column<select name="field" defaultValue={field}><option value="">All columns</option>{resource.columns.map(column => <option key={column.name}>{column.name}</option>)}</select></label>
        <label>Exact value<input name="value" defaultValue={value} maxLength={500} /></label><button>Search</button>
        <Link href={"/admin/database/" + name}>Clear</Link></form>
      <p>{data.total} record(s) · {resource.editable.length ? "Editable: " + resource.editable.join(", ") : "Read-only"}</p>
      <DatabaseTable resource={resource} data={data} /><AdminPagination data={data} href={"/admin/database/" + name} search={search} filters={{ field, value }} />
    </section></div>;
}

