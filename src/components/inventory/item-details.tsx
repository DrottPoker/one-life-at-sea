"use client";

import { useState } from "react";
import { ChartLine, X } from "lucide-react";
import { ItemImage } from "@/components/inventory/item-image";
import { ItemCirculationChart } from "@/components/item-circulation-chart";
import { formatCirculation } from "@/lib/circulation";
import { inventoryEntryKey, inventoryCategoryName, formatItemCount, formatItemStat, type InventoryEntry } from "@/lib/inventory";

export function ItemDetails({ item, onClose }: { item: InventoryEntry; onClose: () => void }) {
  const [showCirculation, setShowCirculation] = useState(false);
  const historyId = "circulation-" + inventoryEntryKey(item);
  return <section className="o-item-details" id={"details-" + inventoryEntryKey(item)} aria-label={item.name + " details"}>
    <div className="o-item-description"><p>{item.description}</p>
      <button type="button" className="o-item-icon-button" aria-label={"Close " + item.name + " details"} onClick={onClose}><X aria-hidden="true" /></button>
    </div>
    <p className="o-item-effect">{item.effect_description}</p>
    <div className="o-item-detail-grid">
      <ItemImage key={item.image_path} item={item} large />
      <dl className="o-item-properties">
        <div><dt>Category</dt><dd>{inventoryCategoryName(item.category_id)}</dd></div>
        <div><dt>Quantity</dt><dd>{formatItemCount(item.quantity)}</dd></div>
        {item.stats && <>
          <div><dt>Damage</dt><dd>{formatItemStat(item.stats.damage)}</dd></div>
          <div><dt>Accuracy</dt><dd>{formatItemStat(item.stats.accuracy)}</dd></div>
        </>}
        <div><dt title="Items of this type in the world">Circ.</dt><dd className="o-circulation-value">
          <span>{formatCirculation(item.circulation)}</span>
          <button type="button" className="o-item-icon-button" title="Circulation history"
            aria-label={(showCirculation ? "Hide" : "Show") + " circulation history for " + item.name}
            aria-expanded={showCirculation} aria-controls={showCirculation ? historyId : undefined}
            onClick={() => setShowCirculation(value => !value)}><ChartLine aria-hidden="true" /></button>
        </dd></div>
      </dl>
    </div>
    {showCirculation && <ItemCirculationChart id={historyId} itemId={item.item_id} name={item.name} circulation={item.circulation} />}
  </section>;
}

