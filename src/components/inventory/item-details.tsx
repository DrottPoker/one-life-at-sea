"use client";

import { useState } from "react";
import { ChartLine, Coins, X } from "lucide-react";
import { ItemImage } from "@/components/inventory/item-image";
import { ItemHistoryChart } from "@/components/item-history-chart";
import { gameplay } from "@/config/public";
import { formatCirculation } from "@/lib/circulation";
import { inventoryEntryKey, inventoryCategoryName, type InventoryEntry } from "@/lib/inventory";
import { formatQuality, itemStatRows, SLOT_LABELS } from "@/lib/equipment";

// The inventory row already shows its stack count, so only the marketplace passes a quantity row.
export function ItemDetails({ item, onClose, quantity }: { item: InventoryEntry; onClose: () => void; quantity?: { label: string; value: string } }) {
  const [chart, setChart] = useState<"circulation" | "value" | null>(null);
  const showCirculation = chart === "circulation", showValue = chart === "value";
  const historyId = (chart ?? "history") + "-" + inventoryEntryKey(item);
  const facts = [
    { key: "category", label: "Category", value: inventoryCategoryName(item.category_id) },
    ...quantity ? [{ key: "quantity", ...quantity }] : [],
    ...item.slot ? [{ key: "slot", label: "Slot", value: SLOT_LABELS[item.slot] + (item.equipped_slot ? " (equipped)" : "") }] : [],
    ...item.stats ? [{ key: "quality", label: "Quality", value: formatQuality(item.stats.quality) }, ...itemStatRows(item.stats).map(row => ({ key: row.key, label: row.label, value: row.text }))] : [],
  ];
  // Value and Circ always share the last row, so an odd count lets Category fill its own row.
  const wide = facts.length % 2 === 1;
  return <section className="o-item-details" id={"details-" + inventoryEntryKey(item)} aria-label={item.name + " details"}>
    <div className="o-item-description"><p>{item.description}</p>
      <button type="button" className="o-item-icon-button" aria-label={"Close " + item.name + " details"} onClick={onClose}><X aria-hidden="true" /></button>
    </div>
    <p className="o-item-effect">{item.effect_description}</p>
    <div className="o-item-detail-grid">
      <ItemImage key={item.image_path} item={item} large />
      <dl className="o-item-properties">
        {facts.map((fact, index) => <div key={fact.key} data-wide={(wide && index === 0) || undefined}
          data-column={wide && index === 0 ? undefined : (index + (wide ? 1 : 0)) % 2 + 1}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}
        <div data-column="1"><dt title={"Average price per item, weighted by units sold in the last " + gameplay.marketplace.valueWindowHours + " hours"}>Value</dt><dd className="o-item-history-value">
          <span title={item.market_value === null ? "No completed market sales yet" : "Gold Coins"} className="o-item-market-value">
            {item.market_value !== null && <Coins aria-hidden="true" />}{formatCirculation(item.market_value)}
          </span>
          <button type="button" className="o-item-icon-button" title="Market value history"
            aria-label={(showValue ? "Hide" : "Show") + " market value history for " + item.name}
            aria-expanded={showValue} aria-controls={showValue ? historyId : undefined}
            onClick={() => setChart(value => value === "value" ? null : "value")}><ChartLine aria-hidden="true" /></button>
        </dd></div>
        <div data-column="2"><dt title="Items of this type in the world">Circ.</dt><dd className="o-item-history-value o-circulation-value">
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

