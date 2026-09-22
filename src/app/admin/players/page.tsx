import Link from "next/link";
import { readAdminTable } from "@/lib/admin-server";
import { adminPageNumber } from "@/lib/admin";
import { AdminPagination } from "@/components/admin/database-table";

export default async function AdminPlayers({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const params = await searchParams;
  const search = (params.q ?? "").slice(0, 200);
  const term = /^#[0-9]+$/.test(search) ? search.slice(1) : search;
  const data = await readAdminTable("characters", term, adminPageNumber(params.page));
  return <>
    <h2>Players</h2><form className="admin-search"><label>Search players<input name="q" defaultValue={search} maxLength={200} placeholder="Name, player ID, character UUID or account UUID" /></label><button>Search</button></form>
    <p>{data.total} player(s)</p><div className="admin-table-wrap"><table><thead><tr><th>Captain</th><th>Player ID</th><th>Gold</th><th>Bank</th><th>Energy / Stamina</th><th>Ship / crew health</th><th>Hospital until</th><th>Character ID</th></tr></thead>
    <tbody>{data.rows.map(row => <tr key={row.values.id}><td><Link href={"/admin/players/" + row.values.id}>{row.values.display_name}</Link></td>
      <td>{row.values.player_number}</td><td>{row.values.gold_coins}</td><td>{row.values.bank_gold_coins}</td><td>{row.values.energy} / {row.values.stamina}</td><td>{row.values.ship_health} / {row.values.crew_health}</td>
      <td>{row.values.hospital_until ?? "-"}</td><td><code>{row.values.id}</code></td></tr>)}</tbody></table></div>
    {!data.rows.length && <p>No players match this search.</p>}<AdminPagination data={data} href="/admin/players" search={search} />
  </>;
}

