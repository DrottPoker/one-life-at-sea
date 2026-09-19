import Link from "next/link";
import { requireAdmin } from "@/lib/admin-server";
import { createClient } from "@/lib/supabase/server";

const metrics: Record<string, { label: string; table: string }> = {
  players: { label: "Players", table: "characters" }, hospital: { label: "In hospital", table: "hospital_patients" },
  active_combats: { label: "Active combats", table: "combat_engagements" }, pending_jobs: { label: "Pending ship jobs", table: "ship_upgrade_jobs" },
  gold_coins: { label: "Gold carried", table: "characters" }, bank_gold_coins: { label: "Gold in banks", table: "characters" },
  equipment: { label: "Equipment instances", table: "item_instances" }, stacked_items: { label: "Stacked items", table: "item_stacks" },
};
export default async function AdminHome() {
  await requireAdmin();
  const { data, error } = await (await createClient()).rpc("admin_overview");
  if (error || !data) throw new Error("Admin overview could not be loaded.");
  return <>
    <h2>Game overview</h2><p>Current database totals. Open Players to manage a captain or Database to inspect game records.</p>
    <div className="admin-metrics">{Object.entries(metrics).map(([key, metric]) =>
      <Link key={key} href={"/admin/database/" + metric.table}><span>{metric.label}</span><strong>{BigInt(data[key]).toLocaleString("en-US")}</strong></Link>)}</div>
    <section className="admin-card"><h2>Administrative tools</h2>
      <p>Search players, change stats and balances, manage training progress, generate or remove items, release patients, end combat and cancel ship jobs.</p>
      <p>Every change requires a reason and creates an audit record. Database constraints and concurrent-change checks apply.</p>
      <p>Config catalogs, derived tables and historical receipts are read-only here. Their owning config or game operation remains authoritative.</p>
      <Link href="/admin/players">Find a player</Link>
    </section>
  </>;
}

