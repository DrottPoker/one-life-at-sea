"use client";
import { useState } from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { MutationForm } from "@/components/admin/mutation-form";
import { ItemImage } from "@/components/inventory/item-image";
import type { AdminRow } from "@/lib/admin";
import { DEFAULT_ITEM_IMAGE, itemIdentifier, lootChances, lootValidation, type LootEntry, type LootTable } from "@/lib/loot";

export function LootEditor({ table, items }: { table?: LootTable; items: AdminRow[] }) {
  const [name, setName] = useState(table?.name ?? ""), [id, setId] = useState(table?.id ?? "");
  const [description, setDescription] = useState(table?.description ?? ""), [active, setActive] = useState(table?.active ?? true);
  const [entries, setEntries] = useState<LootEntry[]>(table?.entries ?? []), [level, setLevel] = useState(1);
  const [selected, setSelected] = useState("");
  const available = items.filter(item => item.values.active === "true" && !entries.some(entry => entry.item_id === item.values.id));
  const selectedId = available.some(item => item.values.id === selected) ? selected : available[0]?.values.id ?? "";
  const issue = lootValidation(entries);
  const chances = lootChances(entries, level);
  const fixed = entries.reduce((sum, entry) => sum + (entry.mode === "fixed" ? entry.fixed_chance : 0), 0);
  function update(index: number, patch: Partial<LootEntry>) { setEntries(previous => previous.map((entry, i) => i === index ? { ...entry, ...patch } : entry)); }
  return <MutationForm action="save_loot_table" payload={{ id, name, description, active, version: table?.version ?? null, entries }}
    label="Review loot table" summary={'Save "' + name + '" with ' + entries.length + ' item(s). Changes apply to new attempts at every linked activity.'} disabled={!!issue}
    successHref={table ? "/admin/loot/" + table.id : "/admin/loot"}>
    <section className="admin-card"><h2>Table details</h2><div className="admin-fields">
      <label>Table name<input required maxLength={100} value={name} onChange={event => { if (!table && id === itemIdentifier(name)) setId(itemIdentifier(event.target.value)); setName(event.target.value); }} /></label>
      <label>Description<input maxLength={2000} value={description} onChange={event => setDescription(event.target.value)} /></label></div>
      <div className="admin-checks"><label><input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} />Active and available for activities</label></div>
      <details><summary>Table identifier</summary><label>Table ID<input required readOnly={!!table} pattern="(?!new$)[a-z][a-z0-9_]{0,47}" maxLength={48} value={id} onChange={event => setId(event.target.value)} /></label></details>
    </section>
    <div className="admin-editor-grid"><section className="admin-card"><h2>Possible catches</h2>
      <p>One item is selected per successful catch. Fixed chances are checked first; weighted items share the remaining chance.</p>
      <div className="admin-search"><label>Item to add<select value={selectedId} onChange={event => setSelected(event.target.value)}>
        {!available.length && <option value="">No more available items</option>}{available.map(item => <option key={item.values.id} value={item.values.id!}>{item.values.name}</option>)}
      </select></label><button type="button" disabled={!selectedId || entries.length >= 50} onClick={() => setEntries(previous => [...previous, { item_id: selectedId, mode: "weighted", fixed_chance: 0, weight_start: 10, weight_end: 10, quantity: 1, damage: 0, accuracy: 0 }])}><Plus size={16} aria-hidden="true" /> Add item</button></div>
      {!items.length && <Link href="/admin/items/new">Create an item first</Link>}
      <div className="admin-loot-entries">{entries.map((entry, i) => {
        const item = items.find(item => item.values.id === entry.item_id)?.values;
        const title = item?.name ?? entry.item_id;
        return <fieldset className="admin-loot-entry" key={entry.item_id}><legend>{title}</legend><div className="admin-row-header">
          <ItemImage item={{ name: title, image_path: item?.image_path ?? DEFAULT_ITEM_IMAGE }} /><code>{entry.item_id}</code>
          {item?.active === "false" && <span className="admin-badge">Disabled item</span>}
          <button className="admin-icon-button admin-secondary" type="button" aria-label={"Remove " + title} onClick={() => setEntries(previous => previous.filter((_, index) => index !== i))}><Trash2 size={16} /></button></div>
          <div className="admin-fields"><label>Chance rule<select aria-label={title + " chance rule"} value={entry.mode} onChange={event => update(i, event.target.value === "fixed" ? { mode: "fixed", fixed_chance: 1, weight_start: 0, weight_end: 0 } : { mode: "weighted", fixed_chance: 0, weight_start: 10, weight_end: 10 })}>
            <option value="weighted">Weight changes with level</option><option value="fixed">Fixed % per successful catch</option></select></label>
            <label>Quantity<input aria-label={title + " quantity"} type="number" required min={1} max={100} step={1} value={entry.quantity} onChange={event => update(i, { quantity: Number(event.target.value) })} /></label>
            {entry.mode === "fixed" ? <label>Fixed chance (%)<input aria-label={title + " fixed chance"} type="number" required min={0.0001} max={100} step={0.0001} value={entry.fixed_chance} onChange={event => update(i, { fixed_chance: Number(event.target.value) })} /></label> : <>
              <label>Weight at level 1<input aria-label={title + " starting weight"} type="number" required min={0} max={1000000} step={0.0001} value={entry.weight_start} onChange={event => update(i, { weight_start: Number(event.target.value) })} /></label>
              <label>Weight at mastery<input aria-label={title + " mastery weight"} type="number" required min={0} max={1000000} step={0.0001} value={entry.weight_end} onChange={event => update(i, { weight_end: Number(event.target.value) })} /></label></>}
            {item?.kind === "equipment" && <><label>Damage<input aria-label={title + " damage"} type="number" min={0} max={1000000000} step={0.01} required value={entry.damage} onChange={event => update(i, { damage: Number(event.target.value) })} /></label>
              <label>Accuracy<input aria-label={title + " accuracy"} type="number" min={0} max={100} step={0.01} required value={entry.accuracy} onChange={event => update(i, { accuracy: Number(event.target.value) })} /></label></>}
          </div></fieldset>;
      })}</div>
      {issue && <p className="admin-help" role="status">{issue}</p>}
    </section><aside className="admin-card admin-loot-preview"><h2>Chance preview</h2>
      <p>Percentage of <strong>successful catches</strong>. Catch difficulty is set separately for each activity.</p>
      <label>Preview skill level: <output>{level}</output><input aria-label="Preview skill level" type="range" min={1} max={99} value={level} onChange={event => setLevel(Number(event.target.value))} /></label>
      <small>This preview reaches mastery at level 99. Linked activities may use another mastery level.</small>
      <div className="admin-help">Fixed items: <strong>{fixed.toLocaleString("en-GB", { maximumFractionDigits: 4 })}%</strong><br />Weighted pool: <strong>{Math.max(0, 100 - fixed).toLocaleString("en-GB", { maximumFractionDigits: 4 })}%</strong></div>
      {!issue && chances.map(entry => <div className="admin-chance-row" key={entry.item_id}>
        <div><span>{items.find(item => item.values.id === entry.item_id)?.values.name ?? entry.item_id}</span><strong>{entry.chance.toLocaleString("en-GB", { maximumFractionDigits: 4 })}%</strong></div>
        <div className="admin-chance-track"><span style={{ width: entry.chance + "%" }} /></div>
      </div>)}
      <p className="admin-muted">Weights interpolate evenly with level. Equal starting and mastery weights keep an item&apos;s weight constant.</p>
    </aside></div><Link href="/admin/loot">Back to loot tables</Link>
  </MutationForm>;
}
