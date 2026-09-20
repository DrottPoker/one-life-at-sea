"use client";

import { useState } from "react";
import { ChartLine, Coins, X } from "lucide-react";
import { ItemImage } from "@/components/inventory/item-image";
import { ItemHistoryChart } from "@/components/item-history-chart";
import { gameplay } from "@/config/public";
import { formatCirculation } from "@/lib/circulation";
import { inventoryEntryKey, inventoryCategoryName, formatItemCount, formatItemStat, type InventoryEntry } from "@/lib/inventory";

export function ItemDetails({ item, onClose, quantityLabel = "Quantity", quantityDisplay }: { item: InventoryEntry; onClose: () => void; quantityLabel?: string; quantityDisplay?: string }) {
  const [chart, setChart] = useState<"circulation" | "value" | null>(null);
  const showCirculation = chart === "circulation", showValue = chart === "value";
  const historyId = (chart ?? "history") + "-" + inventoryEntryKey(item);
  return <section className="o-item-details" id={"details-" + inventoryEntryKey(item)} aria-label={item.name + " details"}>
    <div className="o-item-description"><p>{item.description}</p>
      <button type="button" className="o-item-icon-button" aria-label={"Close " + item.name + " details"} onClick={onClose}><X aria-hidden="true" /></button>
    </div>
    <p className="o-item-effect">{item.effect_description}</p>
    <div className="o-item-detail-grid">
      <ItemImage key={item.image_path} item={item} large />
      <dl className="o-item-properties">
        <div><dt>Category</dt><dd>{inventoryCategoryName(item.category_id)}</dd></div>
        <div><dt>{quantityLabel}</dt><dd>{quantityDisplay ?? formatItemCount(item.quantity)}</dd></div>
        {item.stats && <>
          <div><dt>Damage</dt><dd>{formatItemStat(item.stats.damage)}</dd></div>
          <div><dt>Accuracy</dt><dd>{formatItemStat(item.stats.accuracy)}</dd></div>
        </>}
        <div><dt title={"Average price per item, weighted by units sold in the last " + gameplay.marketplace.valueWindowHours + " hours"}>Value</dt><dd className="o-item-history-value">
          <span title={item.market_value === null ? "No completed market sales yet" : "Gold Coins"} className="o-item-market-value">
            {item.market_value !== null && <Coins aria-hidden="true" />}{formatCirculation(item.market_value)}
          </span>
          <button type="button" className="o-item-icon-button" title="Market value history"
            aria-label={(showValue ? "Hide" : "Show") + " market value history for " + item.name}
            aria-expanded={showValue} aria-controls={showValue ? historyId : undefined}
            onClick={() => setChart(value => value === "value" ? null : "value")}><ChartLine aria-hidden="true" /></button>
        </dd></div>
        <div><dt title="Items of this type in the world">Circ.</dt><dd className="o-item-history-value o-circulation-value">
          <span>{formatCirculation(item.circulation)}</span>
          <button type="button" className="o-item-icon-button" title="Circulation history"
            aria-label={(showCirculation ? "Hide" : "Show") + " circulation history for " + item.name}
            aria-expanded={showCirculation} aria-controls={showCirculation ? historyId : undefined}
            onClick={() => setChart(value => value === "circulation" ? null : "circulation")}><ChartLine aria-hidden="true" /></button>
        </dd></div>
      </dl>
    </div>
    {chart && <ItemHistoryChart key={chart} metric={chart} id={historyId} itemId={item.item_id} name={item.name}
      total={chart === "value" ? item.market_value : item.circulation} />}
  </section>;
}

