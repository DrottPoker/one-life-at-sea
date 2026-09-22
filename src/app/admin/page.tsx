import Link from "next/link";
import { Package, Dices, Compass, Users, ArrowRight, ChartNoAxesCombined } from "lucide-react";
import { readAdminTable, requireAdmin } from "@/lib/admin-server";
import { createClient } from "@/lib/supabase/server";

const metrics: Record<string, { label: string; table: string }> = {
  players: { label: "Players", table: "characters" }, hospital: { label: "In hospital", table: "hospital_patients" },
  active_combats: { label: "Active combats", table: "combat_engagements" }, pending_jobs: { label: "Pending ship jobs", table: "ship_upgrade_jobs" },
  gold_coins: { label: "Gold carried", table: "characters" }, bank_gold_coins: { label: "Gold in banks", table: "characters" },
  equipment: { label: "Equipment instances", table: "item_instances" }, stacked_items: { label: "Stacked items", table: "item_stacks" },
};
const tools = [
  { href: "/admin/economy", title: "Economy", description: "Track Gold Coins, item values and the richest captains.", icon: ChartNoAxesCombined },
  { href: "/admin/items", title: "Items", description: "Create items, upload artwork and manage the catalog.", icon: Package },
  { href: "/admin/loot", title: "Loot tables", description: "Choose possible catches and preview their chances.", icon: Dices },
  { href: "/admin/activities", title: "Activities", description: "Connect loot tables and balance catch difficulty.", icon: Compass },
  { href: "/admin/players", title: "Player tools", description: "Find a captain, adjust resources and manage inventory.", icon: Users },
];
export default async function AdminHome() {
  await requireAdmin();
  const [{ data, error }, audit] = await Promise.all([(await createClient()).rpc("admin_overview"), readAdminTable("admin_audit")]);
  if (error || !data) throw new Error("Admin overview could not be loaded.");
  return <>
    <div className="admin-page-heading"><div><h2>Game overview</h2><p>Manage the world, its rewards and its players.</p></div></div>
    <div className="admin-tool-grid">{tools.map(({ href, title, description, icon: Icon }) => <Link href={href} key={href} className="admin-tool-card"><Icon size={24} aria-hidden="true" /><h3>{title}</h3><p>{description}</p><ArrowRight size={18} aria-hidden="true" /></Link>)}</div>
    <section><h2>Live game totals</h2><div className="admin-metrics">{Object.entries(metrics).map(([key, metric]) =>
      <Link key={key} href={"/admin/database/" + metric.table}><span>{metric.label}</span><strong>{BigInt(data[key]).toLocaleString("en-GB")}</strong></Link>)}</div></section>
    <section className="admin-card"><div className="admin-row-header"><h2>Recent changes</h2><Link href="/admin/database/admin_audit">View audit log</Link></div>
      {audit.rows.slice(0, 5).map(row => <Link className="admin-audit-row" key={row.values.id} href={"/admin/database/admin_audit?field=id&value=" + row.values.id}><span><strong>{row.values.reason}</strong><small>{row.values.action?.replaceAll("_", " ")}</small></span><time>{new Date(row.values.created_at!).toLocaleString("en-GB", { timeZone: "UTC" })} UTC</time></Link>)}
      {!audit.rows.length && <p>No administrative changes recorded yet.</p>}
    </section>
    <div className="admin-help"><strong>From item to catch</strong><p>Create an item → add it to a loot table → connect the table to an activity. Use the level preview to see how rewards change as players improve.</p></div>
  </>;
}
