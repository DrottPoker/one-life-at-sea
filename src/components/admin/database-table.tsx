import Link from "next/link";
import { adminLabel, type AdminPage, type AdminResource } from "@/lib/admin";
import { RecordEditor } from "@/components/admin/record-editor";

export function AdminPagination({ data, href, search = "", filters = {} }: { data: AdminPage; href: string; search?: string; filters?: Record<string, string> }) {
  const query = new URLSearchParams({ q: search, ...filters });
  const link = (page: number) => href + "?" + new URLSearchParams({ ...Object.fromEntries(query), page: String(page) });
  return <nav className="admin-pagination" aria-label="Pagination">
    {data.page > 0 && <Link href={link(data.page - 1)}>Previous</Link>}
    <span>Page {data.page + 1} / {((BigInt(data.total) + BigInt(data.page_size) - 1n) / BigInt(data.page_size) || 1n).toString()}</span>
    {BigInt((data.page + 1) * data.page_size) < BigInt(data.total) && <Link href={link(data.page + 1)}>Next</Link>}
  </nav>;
}

export function DatabaseTable({ resource, data }: { resource: AdminResource; data: AdminPage }) {
  return <><div className="admin-table-wrap"><table><thead><tr><th>Record</th>{resource.columns.map(column => <th key={column.name} title={column.type}>{adminLabel(column.name)}{column.primary ? " (PK)" : ""}</th>)}</tr></thead>
    <tbody>{data.rows.map((row, index) => <tr key={resource.columns.filter(c => c.primary).map(c => row.values[c.name]).join(":")}>
      <td><RecordEditor resource={resource} row={row} label={"Open row " + (index + 1)} />
        {resource.name === "characters" && <Link href={"/admin/players/" + row.values.id}>Player tools</Link>}</td>
      {resource.columns.map(column => <td key={column.name}><span className="admin-cell" title={row.values[column.name] ?? "NULL"}>{row.values[column.name] ?? <em>NULL</em>}</span></td>)}</tr>)}</tbody></table></div>
    {!data.rows.length && <p>No records match this selection.</p>}</>;
}

