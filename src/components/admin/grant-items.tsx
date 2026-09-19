"use client";

import { useState } from "react";
import type { AdminRow } from "@/lib/admin";
import { MutationForm } from "@/components/admin/mutation-form";

export function GrantItems({ characterId, playerName, definitions }: { characterId: string; playerName: string; definitions: AdminRow[] }) {
  const [itemId, setItemId] = useState(definitions[0]?.values.id ?? "");
  const [quantity, setQuantity] = useState("1");
  const [damage, setDamage] = useState("10");
  const [accuracy, setAccuracy] = useState("50");
  const item = definitions.find(row => row.values.id === itemId);
  const equipment = item?.values.stackable === "false";
  return <section className="admin-card"><h2>Generate items</h2>
    <MutationForm action="grant_items" payload={{ character_id: characterId, item_id: itemId, quantity, ...(equipment ? { damage, accuracy } : {}) }}
      label="Review item grant" summary={"Generate items for " + playerName + "."} disabled={!item}>
      <div className="admin-fields">
        <label>Item<select value={itemId} onChange={event => setItemId(event.target.value)}>{definitions.map(row =>
          <option key={row.values.id} value={row.values.id!}>{row.values.name} ({row.values.id})</option>)}</select></label>
        <label>Quantity<input type="number" min={1} max={equipment ? 100 : 1000000} step={1} required value={quantity} onChange={event => setQuantity(event.target.value)} /></label>
        {equipment && <><label>Damage<input type="number" min={0} max={1000000000} step="0.01" required value={damage} onChange={event => setDamage(event.target.value)} /></label>
          <label>Accuracy<input type="number" min={0} max={100} step="0.01" required value={accuracy} onChange={event => setAccuracy(event.target.value)} /></label></>}
      </div><p>{equipment ? "Each piece is a separate instance with the chosen stats (maximum 100)." : "The quantity is added to the player's existing stack (maximum 1,000,000 per request)."}</p>
    </MutationForm>
  </section>;
}

