"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { RefreshCw, Coins, Package, Landmark, TrendingUp } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { ItemImage } from "@/components/inventory/item-image";
import { EconomyChart } from "@/components/admin/economy-chart";
import { economyDate, economyNumber as number, economyPeriods, economyShare, type EconomyDashboard,
  type EconomyPeriod, type EconomyRanking, type EconomySort } from "@/lib/economy";

type Filters = { period: EconomyPeriod; item_search: string; item_sort: EconomySort; item_page: number };
const initialFilters: Filters = { period: "7d", item_search: "", item_sort: "value", item_page: 0 };
const rankingLabels = { coins: "Gold Coins", items: "Item wealth", total: "Combined wealth" };

export function EconomyDashboardView({ initial }: { initial: EconomyDashboard }) {
  const [data, setData] = useState<EconomyDashboard | null>(initial);
  const [filters, setFilters] = useState(initialFilters);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<EconomySort>("value");
  const [ranking, setRanking] = useState<EconomyRanking>("coins");
  const [refresh, setRefresh] = useState(0);
  const [loadedKey, setLoadedKey] = useState(JSON.stringify(initialFilters) + ":0");
  const [error, setError] = useState("");
  const key = JSON.stringify(filters) + ":" + refresh;
  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === "visible") setRefresh(value => value + 1); }, 60000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const result = await createClient().rpc("admin_economy", filters).abortSignal(controller.signal);
        if (controller.signal.aborted) return;
        if (result.error || !result.data) {
          if (["ADMIN_REQUIRED", "REGISTERED_PLAYER_REQUIRED"].includes(result.error?.message ?? "")) setData(null);
          setError("Could not refresh the economy. Any figures below are from the last successful update.");
        } else { setData(result.data); setError(""); }
      } catch { if (!controller.signal.aborted) setError("Connection interrupted. Showing the last successful update."); }
      if (!controller.signal.aborted) setLoadedKey(key);
    }
    void load();
    return () => controller.abort();
  }, [filters, refresh, key]);
  const pending = loadedKey !== key;
  function searchItems(event: FormEvent) {
    event.preventDefault(); setFilters(value => ({ ...value, item_search: search.trim(), item_sort: sort, item_page: 0 }));
  }
  if (!data) return <div className="admin-error" role="alert">Administrator access is no longer available. <Link href="/">Return to game</Link></div>;
  const totals = data.totals, market = data.market_24h;
  const players = data.rankings?.[ranking] ?? [];
  const stale = !data.last_snapshot || Date.parse(data.observed_at) - Date.parse(data.last_snapshot) > 12 * 60000;
  const coinsChange = BigInt(totals.coins) - BigInt(data.history[0]?.coins ?? totals.coins);
  const topTenShare = economyShare(totals.top_ten_coins, totals.coins);
  const goldShare = economyShare(totals.gold, totals.coins);
  const pageCount = Math.max(1, Math.ceil(Number(data.items.total) / data.items.page_size));
  const metrics = [
    { label: "Gold Coins in circulation", value: totals.coins, icon: Coins, note: number(totals.gold) + " carried · " + number(totals.bank) + " in banks" },
    { label: "Estimated item value", value: totals.item_value, icon: Package, note: "Gold Coins · includes items listed for sale" },
    { label: "Items in circulation", value: totals.item_units, icon: Landmark, note: number(totals.listed_units) + " currently listed for sale" },
    { label: "Combined known wealth", value: (BigInt(totals.coins) + BigInt(totals.item_value)).toString(), icon: TrendingUp, note: "Gold Coins + priced items · unpriced items excluded" },
  ];
  return <>
    <div className="admin-page-heading"><div><h2>Economy</h2><p>Monitor the world&apos;s money, items and player wealth.</p></div>
      <button className="admin-secondary" onClick={() => setRefresh(value => value + 1)} disabled={pending}><RefreshCw size={16}/>Refresh</button></div>
    <div className="economy-status"><span>Updated {economyDate(data.observed_at)} · refreshes every minute</span><span role="status">{pending ? "Updating..." : error}</span></div>
    {stale && <p className="economy-warning" role="status">Scheduled history is delayed. Live totals are current as of the update above. Last measurement: {data.last_snapshot ? economyDate(data.last_snapshot) : "none"}.</p>}
    <div className="admin-metrics economy-metrics">{metrics.map(({ label, value, icon: Icon, note }) => <div key={label}><span><Icon size={17} aria-hidden="true"/>{label}</span><strong>{number(value)}</strong><small>{note}</small></div>)}</div>
    <div className="economy-grid-two">
      <section className="admin-card"><h3>Money distribution</h3><div className="economy-distribution" role="img" aria-label={`${goldShare}% carried, ${100 - goldShare}% in banks`}><span style={{ width: goldShare + "%" }}/></div>
        <div className="economy-split"><span><i/>Carried <strong>{number(totals.gold)}</strong></span><span><i/>Banked <strong>{number(totals.bank)}</strong></span></div>
        <p>The 10 richest captains hold <strong>{topTenShare.toFixed(1)}%</strong> of all Gold Coins.</p><small>{number(totals.players)} characters included, including inactive players and admins.</small></section>
      <section className="admin-card"><h3>Market activity · last 24 hours</h3><dl className="economy-market-stats">
        <div><dt>Trade volume</dt><dd>{number(market.volume)} <small>Gold Coins</small></dd></div><div><dt>Fees removed</dt><dd>{number(market.fees)} <small>Gold Coins</small></dd></div>
        <div><dt>Completed purchases</dt><dd>{number(market.trades)}</dd></div><div><dt>Items traded</dt><dd>{number(market.units)}</dd></div>
      </dl></section>
    </div>
    {BigInt(totals.unpriced_units) > BigInt(0) && <div className="economy-warning"><strong>{number(totals.unpriced_units)} items have no market value yet</strong><p>{number(totals.unpriced_types)} item types have circulating stock but no completed sales. Their quantities are included; their value is excluded from estimates and rankings.</p></div>}
    <div className="admin-row-header"><h2>Economy over time</h2><div className="economy-tabs" aria-label="History period">{economyPeriods.map(p => <button className="admin-secondary" key={p.id} aria-pressed={filters.period === p.id} onClick={() => setFilters(value => ({ ...value, period: p.id }))}>{p.label}</button>)}</div></div>
    <p className="admin-muted">Showing {economyPeriods.find(period => period.id === data.period)?.label.toLowerCase()}. History since {data.tracked_since ? economyDate(data.tracked_since) : "the first scheduled observation"}. Measurements every 5 minutes, plus the live reading. {data.sampled && "Long histories show sampled observations. "}Gold supply change in the shown period: <strong>{coinsChange > BigInt(0) ? "+" : ""}{number(coinsChange)}</strong>.</p>
    <div className="economy-grid-two">
      <EconomyChart title="Gold Coins supply" points={data.history.map(p => ({ at: p.at, total: p.coins }))} sampled={data.sampled}/>
      <EconomyChart title="Estimated item value" points={data.history.map(p => ({ at: p.at, total: p.item_value }))} sampled={data.sampled}/>
      <EconomyChart title="Items in circulation" unit="items" points={data.history.map(p => ({ at: p.at, total: p.item_units }))} sampled={data.sampled}/>
      <EconomyChart title="Market turnover · 30 days" daily points={data.market_days.map(p => ({ at: p.at, total: p.volume }))}/>
    </div>
    <section className="admin-card" aria-label="Richest players"><div className="admin-row-header"><h2>Richest players</h2><div className="economy-tabs">{(Object.keys(rankingLabels) as EconomyRanking[]).map(id => <button key={id} className="admin-secondary" aria-pressed={ranking === id} onClick={() => setRanking(id)}>{rankingLabels[id]}</button>)}</div></div>
      <p className="admin-muted">Top 20 · money includes bank balances; item wealth includes the seller&apos;s market listings. Unpriced items are excluded.</p>
      <div className="admin-table-wrap economy-ranking-scroll"><table><thead><tr><th>Rank / Captain</th><th>Gold Coins</th><th>Inventory value</th><th>Listed value</th><th>Combined wealth</th></tr></thead><tbody>
        {players.map((player, index) => {
          const key = ranking === "coins" ? "coins" : ranking === "items" ? "item_value" : "total_value";
          return <tr key={player.id}><td><Link href={"/admin/players/" + player.id}><strong>{index + 1}. {player.name}</strong></Link><small className="economy-block">ID {player.player_number}</small>
            <div className="economy-rank-bar"><span style={{ width: economyShare(player[key], players[0][key]) + "%" }}/></div>{player.unpriced_units !== "0" && <small>{number(player.unpriced_units)} unpriced items</small>}</td>
            <td>{number(player.coins)}<small className="economy-block">{number(player.bank)} banked</small></td><td>{number(player.inventory_value)}</td><td>{number(player.listed_value)}</td><td><strong>{number(player.total_value)}</strong></td></tr>;
        })}
        {!players.length && <tr><td colSpan={5}>No characters yet.</td></tr>}
      </tbody></table></div>
    </section>
    <section className="admin-card" aria-label="All items"><h2>All items</h2><p className="admin-muted">Circulation and value by item type. Includes inactive definitions and equipped items.</p>
      <form className="admin-search" onSubmit={searchItems}><label>Find an item<input value={search} maxLength={100} onChange={e => setSearch(e.target.value)} placeholder="Name or item ID"/></label>
        <label>Sort items<select value={sort} onChange={e => setSort(e.target.value as EconomySort)}><option value="value">Highest total value</option><option value="quantity">Most in circulation</option><option value="name">Name</option><option value="unpriced">Unpriced first</option></select></label><button disabled={pending}>Apply</button></form>
      <div className="admin-table-wrap"><table><thead><tr><th>Item</th><th>In inventories</th><th>Listed</th><th>Circulation</th><th>Unit value</th><th>Total value</th></tr></thead><tbody>
        {data.items.rows.map(item => <tr key={item.id}><td><div className="economy-item"><ItemImage item={item}/><span><Link href={"/admin/items/" + item.id}>{item.name}</Link><small className="economy-block">{item.id}{!item.active && " · inactive"}</small></span></div></td>
          <td>{number(item.inventory)}</td><td>{number(item.listed)}</td><td>{number(item.units)}</td><td>{number(item.unit_value)}{item.last_sale && <small className="economy-block">Last sale {economyDate(item.last_sale)}</small>}</td><td><strong>{number(item.total_value)}</strong></td></tr>)}
        {!data.items.rows.length && <tr><td colSpan={6}>No items match this search.</td></tr>}
      </tbody></table></div>
      <div className="admin-pagination"><button className="admin-secondary" disabled={pending || data.items.page === 0} onClick={() => setFilters(value => ({ ...value, item_page: Math.max(0, data.items.page - 1) }))}>Previous</button>
        <span>{number(data.items.total)} item types · Page {data.items.page + 1} of {pageCount}</span><button className="admin-secondary" disabled={pending || data.items.page + 1 >= pageCount} onClick={() => setFilters(value => ({ ...value, item_page: data.items.page + 1 }))}>Next</button></div>
    </section>
    <details className="admin-help"><summary>How these figures are calculated</summary><p>Gold supply is carried coins plus bank balances across all existing characters. Transfers between players or between a wallet and a bank do not create money. Market fees remove money; other spending and administrative balance changes also affect supply.</p>
      <p>Item value uses the game&apos;s quantity-weighted average from completed market purchases. When the pricing window is empty, the last available market value is retained. Asking prices are ignored. Equipment uses its item type&apos;s value, regardless of individual stats. Values are estimates, not guaranteed sale proceeds.</p>
      <p>Listed items belong to the seller until sold, and count once in circulation. Items without any completed sale are unpriced. Price changes alone can change total wealth. History begins when monitoring was installed; earlier money supply is unknown.</p></details>
  </>;
}
