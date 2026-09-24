"use client";
import { useState } from "react";
import Link from "next/link";
import { gameplay } from "@/config/public";
import { createClient } from "@/lib/supabase/browser";
import { DEFAULT_ITEM_IMAGE, itemIdentifier } from "@/lib/loot";
import type { AdminRow } from "@/lib/admin";
import { ItemImage } from "@/components/inventory/item-image";
import { MutationForm } from "@/components/admin/mutation-form";
import { CREW_SLOTS, EQUIPMENT_SLOTS, SLOT_LABELS, SLOT_STATS, STAT_NAMES, isEquipmentSlot, type StatKey } from "@/lib/equipment";
import type { AdminJson, AdminValues } from "@/lib/admin";

type RangeKey = Exclude<StatKey, "shots">;
const RANGE_KEYS: RangeKey[] = ["damage", "precision", "armor", "health", "speed"];
function initialStats(values?: AdminValues) {
  return { ...Object.fromEntries(RANGE_KEYS.map(key => [key, { min: values?.[key + "_min"] ?? "", max: values?.[key + "_max"] ?? "" }])) as Record<RangeKey, { min: string; max: string }>,
    shots: values?.shots ?? "" };
}

export function ItemEditor({ row }: { row?: AdminRow }) {
  const initial = row?.values;
  const [values, setValues] = useState({ id: initial?.id ?? "", name: initial?.name ?? "", category_id: initial?.category_id ?? "materials",
    kind: initial?.kind ?? "passive", slot: initial?.slot ?? "none", description: initial?.description ?? "",
    effect_description: initial?.effect_description ?? "", image_path: initial?.image_path ?? DEFAULT_ITEM_IMAGE,
    active: initial?.active !== "false", tradable: initial?.tradable !== "false" });
  const [stats, setStats] = useState(() => initialStats(initial));
  const [uploading, setUploading] = useState(false), [imageError, setImageError] = useState("");
  const statKeys = values.kind === "equipment" && isEquipmentSlot(values.slot) ? SLOT_STATS[values.slot] : [];
  const statPayload: AdminJson = values.kind === "equipment" ? Object.fromEntries(statKeys.map(key =>
    [key, key === "shots" ? Number(stats.shots) : { min: Number(stats[key].min), max: Number(stats[key].max) }])) : null;
  const field = (key: keyof typeof values, value: string | boolean) => setValues(previous => ({ ...previous, [key]: value }));
  async function upload(file: File) {
    setImageError("");
    const extension = ({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" } as Record<string, string>)[file.type];
    if (!extension || file.size > 4194304) { setImageError("Choose a PNG, JPG or WebP image up to 4 MB."); return; }
    setUploading(true);
    try {
      const bitmap = await createImageBitmap(file);
      const validSize = bitmap.width <= 8192 && bitmap.height <= 8192;
      bitmap.close();
      if (!validSize) throw new Error("Image is too large.");
      const client = createClient();
      const { data: { user } } = await client.auth.getUser();
      if (!user) throw new Error("Sign in again.");
      const path = user.id + "/" + crypto.randomUUID() + "." + extension;
      const { error } = await client.storage.from("item-images").upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      field("image_path", "/api/item-images/" + path);
    } catch { setImageError("The image could not be uploaded. Check your connection, administrator access and image (maximum 8192 × 8192)."); }
    finally { setUploading(false); }
  }
  return <MutationForm action="save_item" payload={{ ...values, stats: statPayload, version: row?.version ?? null }} label="Review item" summary={'Save "' + values.name + '" to the item catalog.'} disabled={uploading}
    successHref={row ? "/admin/items/" + values.id : "/admin/items"}>
    <div className="admin-editor-grid"><section className="admin-card"><h2>Item details</h2>
      <label>Item name<input required maxLength={100} value={values.name} onChange={event => {
        const name = event.target.value;
        setValues(previous => ({ ...previous, name, ...(!row && previous.id === itemIdentifier(previous.name) ? { id: itemIdentifier(name) } : {}) }));
      }} /></label>
      <div className="admin-fields"><label>Category<select value={values.category_id} onChange={event => field("category_id", event.target.value)}>
        {gameplay.inventory.categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
      </select></label><label>Item type<select disabled={!!row} value={values.kind} onChange={event => setValues(previous => ({ ...previous, kind: event.target.value, slot: event.target.value === "equipment" ? "melee" : "none" }))}>
        <option value="passive">Material or collectible (stackable)</option><option value="consumable">Consumable (stackable)</option><option value="equipment">Equipment (individual Quality)</option>
      </select></label></div>
      {values.kind === "equipment" && <><label>Equipment slot<select disabled={!!row} value={values.slot} onChange={event => field("slot", event.target.value)}>
        {EQUIPMENT_SLOTS.map(slot => <option key={slot} value={slot}>{(CREW_SLOTS.some(crew => crew === slot) ? "Crew: " : "Ship: ") + SLOT_LABELS[slot]}</option>)}</select></label>
        <fieldset className="admin-fields"><legend>Stat ranges <small>Quality 0% uses the minimum and 100% the maximum. Changes apply to every owned piece.</small></legend>
          {statKeys.map(key => key === "shots" ? <label key={key}>Shots per fight<input type="number" required min={1} step={1} value={stats.shots}
            onChange={event => setStats(previous => ({ ...previous, shots: event.target.value }))} /></label> : <div key={key} className="admin-fields">
            {(["min", "max"] as const).map(bound => <label key={bound}>{STAT_NAMES[key]} {bound}<input type="number" required min={0} step={key === "health" ? 1 : 0.01}
              value={stats[key][bound]} onChange={event => setStats(previous => ({ ...previous, [key]: { ...previous[key], [bound]: event.target.value } }))} /></label>)}
          </div>)}
        </fieldset></>}
      <label>Description<textarea required maxLength={2000} rows={4} value={values.description} onChange={event => field("description", event.target.value)} /></label>
      <label>Effect description <small>Descriptive text only. Equipment effects come from the slot and stat ranges.</small><textarea maxLength={1000} rows={2} value={values.effect_description} onChange={event => field("effect_description", event.target.value)} placeholder="No active effect." /></label>
      <div className="admin-checks"><label><input type="checkbox" checked={values.active} onChange={event => field("active", event.target.checked)} />Available for grants and loot</label>
        <label><input type="checkbox" checked={values.tradable} onChange={event => field("tradable", event.target.checked)} />Tradable on the marketplace</label></div>
      <details><summary>Item identifier</summary><label>Item ID<input required pattern="(?!new$)[a-z][a-z0-9_]{0,47}" maxLength={48} readOnly={!!row} value={values.id} onChange={event => field("id", event.target.value)} /></label><small>A permanent identifier, created from the name. The type and equipment slot are also permanent after creation.</small></details>
    </section><aside className="admin-card"><h2>Item image</h2><div className="admin-image-preview"><ItemImage key={values.image_path} item={{ name: values.name || "New item", image_path: values.image_path }} large /></div>
      <p>{values.image_path === DEFAULT_ITEM_IMAGE ? "Using the shared default image." : "This image will be shown in the inventory and marketplace."}</p>
      <label>Upload image<input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ""; }} /></label>
      <small>PNG, JPG or WebP. Up to 4 MB.</small>
      <button type="button" className="admin-secondary" disabled={uploading || values.image_path === DEFAULT_ITEM_IMAGE} onClick={() => field("image_path", DEFAULT_ITEM_IMAGE)}>Use default image</button>
      {uploading && <p role="status">Uploading image...</p>}{imageError && <p role="alert" className="admin-error">{imageError}</p>}
      <div className="admin-help"><strong>Preview</strong><p>{values.name || "New item"}</p><p>{values.description || "Add a description to introduce this item."}</p></div>
    </aside></div><Link href="/admin/items">Back to items</Link>
  </MutationForm>;
}
