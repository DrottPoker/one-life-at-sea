import Form from "next/form";
import { Users } from "lucide-react";
import { GameLink as Link } from "@/components/game-navigation";
import { Panel } from "@/components/shell";
import { requireCharacter } from "@/lib/player";
import { createClient } from "@/lib/supabase/server";
import { playerProfileUrl, playerSearchUrl } from "@/lib/player-identity";

export const metadata = { title: "Players" };

export default async function PlayersPage({ searchParams }: {
  searchParams: Promise<{ q?: string | string[]; page?: string | string[] }>;
}) {
  await requireCharacter({ allowHospital: true, allowSea: true });
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const requested = typeof params.page === "string" && /^[0-9]{1,10}$/.test(params.page) ? Number(params.page) : 0;
  const page = requested <= 2147483647 ? requested : 0;
  const client = await createClient();
  const { data, error } = await client.rpc("search_players", { search_term: query, requested_page: page });
  if (error || !data) throw new Error("Players could not be loaded. Please try again.");
  const pages = Math.max(1, Math.ceil(data.total / data.page_size));
  return <Panel title="Players" icon={Users}>
    <div className="o-panel-body">
      <Form action="/players" className="o-player-search" key={query}>
        <label htmlFor="player-search">Find a player</label>
        <div><input id="player-search" name="q" defaultValue={query} maxLength={100}
          placeholder="Name or player ID" aria-describedby="player-search-help" /><button className="o-primary" type="submit">Search</button></div>
        <p id="player-search-help" className="o-copy">Search by name or number. Use #100001 to search only for that player ID.</p>
      </Form>
      <p role="status">{data.total} {data.total === 1 ? "player" : "players"} found</p>
    </div>
    <ul className="o-roster-list" aria-label="Player search results">
      {data.players.map(player => <li key={player.character_id}>
        <Link className="o-roster-name" href={playerProfileUrl(player.player_number)} prefetch={false}>{player.display_name}</Link>
      </li>)}
      {data.total === 0 && <li className="o-roster-empty">No players match your search.</li>}
    </ul>
    {pages > 1 && <nav className="o-panel-foot o-roster-footer" aria-label="Player search pages">
      {data.page > 0 ? <Link href={playerSearchUrl(query, data.page - 1)}>Previous</Link> : <span />}
      <span>Page {data.page + 1} of {pages}</span>
      {data.page + 1 < pages ? <Link href={playerSearchUrl(query, data.page + 1)}>Next</Link> : <span />}
    </nav>}
  </Panel>;
}
