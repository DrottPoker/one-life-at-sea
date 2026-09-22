"use client";
import { useState } from "react";
import Link from "next/link";
import { gameplay } from "@/config/public";
import type { AdminRow } from "@/lib/admin";
import { catchChance, type ActivityLoot } from "@/lib/loot";
import { MutationForm } from "@/components/admin/mutation-form";

export function ActivityLootEditor({ activityId, initial, tables }: { activityId: string; initial?: AdminRow; tables: AdminRow[] }) {
  const activity = gameplay.activities.catalog.find(activity => activity.id === activityId)!;
  const [settings, setSettings] = useState<ActivityLoot>({ activity_id: activityId, loot_table_id: initial?.values.loot_table_id ?? null,
    success_start: Number(initial?.values.success_start ?? 70), success_end: Number(initial?.values.success_end ?? 90),
    mastery_level: Number(initial?.values.mastery_level ?? 99), version: initial?.values.version ?? null });
  return <section className="admin-card"><div className="admin-row-header"><div><h2>{activity.name}</h2><p>{activity.description}</p></div><span className="admin-badge">{gameplay.stamina.activityCost} Stamina · {activity.xpGain} XP per attempt</span></div>
    <MutationForm action="save_activity_loot" payload={{ ...settings }} label="Review activity loot" summary={'Update loot and catch difficulty for ' + activity.name + '.'} successHref="/admin/activities">
      <div className="admin-fields"><label>Loot table<select aria-label={activity.name + " loot table"} value={settings.loot_table_id ?? ""} onChange={event => setSettings(previous => ({ ...previous, loot_table_id: event.target.value || null }))}>
        <option value="">No loot (XP only)</option>{tables.filter(table => table.values.active === "true" || table.values.id === settings.loot_table_id).map(table => <option key={table.values.id} value={table.values.id!}>{table.values.name}</option>)}
      </select></label>
      {settings.loot_table_id && <><label>Catch chance at level 1 (%)<input aria-label={activity.name + " starting catch chance"} required type="number" min={0} max={100} step={0.0001} value={settings.success_start} onChange={event => setSettings(previous => ({ ...previous, success_start: Number(event.target.value) }))} /></label>
        <label>Catch chance at mastery (%)<input aria-label={activity.name + " mastery catch chance"} required type="number" min={settings.success_start} max={100} step={0.0001} value={settings.success_end} onChange={event => setSettings(previous => ({ ...previous, success_end: Number(event.target.value) }))} /></label>
        <label>Mastery level<input aria-label={activity.name + " mastery level"} required type="number" min={2} max={99} step={1} value={settings.mastery_level} onChange={event => setSettings(previous => ({ ...previous, mastery_level: Number(event.target.value) }))} /></label></>}
      </div>
      {settings.loot_table_id && <><div className="admin-difficulty-preview">{[1, 50, 99].map(level => <div key={level}><small>Level {level}</small><strong>{catchChance(settings, level).toLocaleString("en-GB", { maximumFractionDigits: 2 })}% catch chance</strong></div>)}</div>
        <p>Each attempt grants {activity.xpGain} XP, even without a catch. Successful catches use the selected table. The mastery level also controls when item weights reach their final values.</p><Link href={"/admin/loot/" + settings.loot_table_id}>Edit this loot table</Link></>}
    </MutationForm>
  </section>;
}
