import Link from "next/link";
import { requireAdmin } from "@/lib/admin-server";
import { createClient } from "@/lib/supabase/server";
import { adminPageNumber } from "@/lib/admin";
import { economyDate, economyNumber } from "@/lib/economy";
import { playerSorts, playerActivityFilters, type PlayerSort, type PlayerActivityFilter } from "@/lib/player-statistics";
import { PlayerStatisticsView } from "@/components/admin/player-statistics";

export default async function AdminPlayers({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; sort?: string; activity?: string }> }) {
  await requireAdmin();
  const params = await searchParams;
  const search = (params.q ?? "").slice(0, 200);
  const term = /^#[0-9]+$/.test(search) ? search.slice(1) : search;
  const sort: PlayerSort = playerSorts.includes(params.sort as PlayerSort) ? params.sort as PlayerSort : "newest";
  const activity: PlayerActivityFilter = playerActivityFilters.includes(params.activity as PlayerActivityFilter) ? params.activity as PlayerActivityFilter : "all";
  const client = await createClient();
  const [statistics, players] = await Promise.all([client.rpc("admin_player_statistics"), client.rpc("admin_players", {
    search_term: term, requested_page: adminPageNumber(params.page), sort_by: sort, activity,
  })]);
  if (statistics.error || !statistics.data || players.error || !players.data) throw new Error("Player administration could not be loaded.");
  const data = players.data;
  const href = (page: number) => "/admin/players?" + new URLSearchParams({ q: search, sort, activity, page: String(page) });
  const pages = (BigInt(data.total) + BigInt(data.page_size) - BigInt(1)) / BigInt(data.page_size) || BigInt(1);
  return <>
    <PlayerStatisticsView initial={statistics.data}/>
    <section className="admin-card admin-player-list" aria-label="Player directory"><h2>Player directory</h2>
      <p className="admin-muted">Find a captain and open their player tools. Statistics above always cover the whole game.</p>
      <form className="admin-search"><label>Search players<input name="q" defaultValue={search} maxLength={200} placeholder="Name, player ID, character UUID or account UUID" /></label>
        <label>Last active<select name="activity" defaultValue={activity}><option value="all">All players</option><option value="24h">Within 24 hours</option><option value="7d">Within 7 days</option><option value="30d">Within 30 days</option><option value="inactive">Over 30 days ago or never</option><option value="never">No recorded activity</option></select></label>
        <label>Sort players<select name="sort" defaultValue={sort}><option value="newest">Newest accounts</option><option value="oldest">Oldest accounts</option><option value="last_active">Latest activity</option><option value="name">Captain name</option></select></label><button>Search</button>
      </form>
      <p>{economyNumber(data.total)} player(s)</p><div className="admin-table-wrap"><table><thead><tr><th>Captain</th><th>Registered</th><th>Last active</th><th>Gold / Bank</th><th>Energy / Stamina</th><th>Ship / crew health</th><th>Hospital until</th></tr></thead>
      <tbody>{data.rows.map(row => <tr key={row.id}><td><Link href={"/admin/players/" + row.id}>{row.display_name}</Link><small className="economy-block">ID {row.player_number}</small></td>
        <td>{economyDate(row.registered_at)}</td><td>{row.last_active_at ? economyDate(row.last_active_at) : "Not recorded"}</td>
        <td>{economyNumber(row.gold_coins)} / {economyNumber(row.bank_gold_coins)}</td><td>{row.energy} / {row.stamina}</td><td>{row.ship_health} / {row.crew_health}</td>
        <td>{row.hospital_until ? economyDate(row.hospital_until) : "-"}</td></tr>)}</tbody></table></div>
      {!data.rows.length && <p>No players match this search.</p>}
      <nav className="admin-pagination" aria-label="Pagination">{data.page > 0 && <Link href={href(data.page - 1)}>Previous</Link>}<span>Page {data.page + 1} / {pages.toString()}</span>
        {BigInt((data.page + 1) * data.page_size) < BigInt(data.total) && <Link href={href(data.page + 1)}>Next</Link>}</nav>
    </section>
  </>;
}
