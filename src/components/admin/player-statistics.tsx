"use client";

import { useEffect, useState } from "react";
import { Users, Activity, UserPlus, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { economyDate, economyNumber as number } from "@/lib/economy";
import { playerPeriods, type PlayerPeriod, type PlayerStatistics } from "@/lib/player-statistics";
import { EconomyChart } from "@/components/admin/economy-chart";

export function PlayerStatisticsView({ initial }: { initial: PlayerStatistics }) {
  const [data, setData] = useState<PlayerStatistics | null>(initial);
  const [period, setPeriod] = useState<PlayerPeriod>(initial.period);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState(initial.period + ":0");
  const [error, setError] = useState("");
  const key = period + ":" + attempt;
  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === "visible") setAttempt(value => value + 1); }, 60000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const result = await createClient().rpc("admin_player_statistics", { period }).abortSignal(controller.signal);
        if (controller.signal.aborted) return;
        if (result.error || !result.data) {
          if (result.error?.message === "ADMIN_REQUIRED") setData(null);
          setError("Could not refresh player statistics. Showing the last successful update.");
        } else { setData(result.data); setError(""); }
      } catch { if (!controller.signal.aborted) setError("Connection interrupted. Showing the last successful update."); }
      if (!controller.signal.aborted) setLoaded(key);
    }
    void load();
    return () => controller.abort();
  }, [period, attempt, key]);
  if (!data) return <p className="admin-error" role="alert">Administrator access is no longer available.</p>;
  const t = data.totals, p = data.period_totals;
  const pending = loaded !== key;
  const metrics = [
    { label: "Total players", value: t.players, icon: Users, note: number(t.accounts) + " accounts · " + number(t.without_character) + " without a character" },
    { label: "Active players · 24 hours", value: t.active_24h, icon: Activity, note: "Unique accounts that have been logged in" },
    { label: "Active players · last month", value: t.active_1m, icon: Activity, note: number(t.active_7d) + " unique accounts in the last 7 days" },
    { label: "New accounts · 24 hours", value: t.new_24h, icon: UserPlus, note: number(t.new_7d) + " in 7 days · " + number(t.new_1m) + " in the last month" },
  ];
  const interval = data.bucket_days === 1 ? "day" : data.bucket_days + "-day interval";
  const dates = Object.fromEntries(data.history.map(p => [p.at, p.at.slice(0, 10) + (data.bucket_days === 1 ? "" : " to " + p.until.slice(0, 10)) + " UTC"]));
  const dateLabel = (at: string) => dates[at];
  return <section aria-label="Player statistics">
    <div className="admin-page-heading"><div><h2>Players</h2><p>Follow new accounts and unique players who have been logged in.</p></div>
      <button className="admin-secondary" onClick={() => setAttempt(value => value + 1)} disabled={pending}><RefreshCw size={16}/>Refresh statistics</button></div>
    <div className="economy-status"><span>Updated {economyDate(data.observed_at)} · refreshes every minute</span><span role="status">{pending ? "Updating..." : error}</span></div>
    <div className="admin-metrics economy-metrics">{metrics.map(({ label, value, icon: Icon, note }) => <div key={label}><span><Icon size={17} aria-hidden="true"/>{label}</span><strong>{number(value)}</strong><small>{note}</small></div>)}</div>
    <div className="admin-row-header"><h3>Community over time</h3><div className="economy-tabs" aria-label="Player statistics period">{playerPeriods.map(p => <button key={p.id} className="admin-secondary" aria-pressed={period === p.id} onClick={() => setPeriod(p.id)}>{p.label}</button>)}</div></div>
    <p className="admin-muted">Showing {playerPeriods.find(p => p.id === data.period)?.label.toLowerCase()} · UTC · {data.bucket_days === 1 ? "daily figures" : data.bucket_days + "-day intervals"} · current interval is partial.</p>
    <div className="player-statistics-summary"><span><strong>{number(p.new_accounts)}</strong> new accounts</span><span><strong>{BigInt(p.net_growth) > BigInt(0) ? "+" : ""}{number(p.net_growth)}</strong> net account growth</span><span><strong>{number(p.removed_accounts)}</strong> accounts removed</span><span><strong>{number(p.unique_active)}</strong> unique active accounts in this period</span></div>
    <div className="economy-grid-two">
      <EconomyChart title={"New accounts per " + interval} dateLabel={dateLabel} unit="accounts" daily points={data.history.map(p => ({ at: p.at, total: p.registrations }))} caption={"Recorded registrations per " + interval + ". The current interval is partial."}/>
      <EconomyChart title="Account growth" dateLabel={dateLabel} unit="accounts" maxGapMs={(data.bucket_days + 1) * 86400000} points={data.history.map(p => ({ at: p.at, total: p.accounts }))} caption="Accounts at the end of each interval; the latest point shows the current total."/>
      <EconomyChart title={"Unique active players per " + interval} dateLabel={dateLabel} unit="accounts" daily missingLabel="Not tracked" points={data.history.map(p => ({ at: p.at, total: p.unique_players }))} caption={"Each account counts once per " + interval + ", including continuing sessions. Earlier untracked days are blank."}/>
    </div>
    <div className="admin-help"><strong>Activity history started {economyDate(data.tracked_since)}</strong><p>Each account counts once in the selected period, even if it appears on several days. Signing in again does not add another player. The first tracked day is partial.</p>
      <details><summary>About the figures</summary><p>Active players means unique accounts that signed in or used an existing session. This is not an online-now count. Recent cards count existing accounts, including admins and accounts without a character. Period history also retains accounts removed later.</p><p>Earlier activity is incomplete. Known latest sign-ins contribute to period totals and recent cards, but daily activity before tracking began is left blank. Accounts deleted before registration tracking began cannot be reconstructed.</p></details></div>
  </section>;
}
