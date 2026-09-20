"use client";

import { useState, type FormEvent } from "react";
import { gameplay, frontend } from "@/config/public";
import { ItemImage } from "@/components/inventory/item-image";
import { MarketCategories, MarketPages, MarketSearch } from "@/components/marketplace/market-shell";
import { MarketFeedback } from "@/components/marketplace/market-listings";
import { useMarketMutation } from "@/components/marketplace/use-market-mutation";
import { formatItemCount, formatItemStat, inventoryEntryKey, parseItemQuantity, type InventoryEntry, type InventoryFilters, type InventoryPage } from "@/lib/inventory";
import { marketCost, marketFee, type SaleEntry } from "@/lib/marketplace";

type Draft = { item: InventoryEntry; selected: boolean; quantity: string; price: string };
const numbers = new Intl.NumberFormat(frontend.site.locale);

export function AddListings({ inventory, filters }: { inventory: InventoryPage; filters: InventoryFilters }) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const mutation = useMarketMutation(() => setDrafts({}));
  const selected = Object.values(drafts).filter(draft => draft.selected);
  const entries: SaleEntry[] = [];
  let valid = selected.length > 0 && selected.length <= gameplay.marketplace.maxBatchSize;
  let gross = 0n, fee = 0n, units = 0n;
  for (const draft of selected) {
    const quantity = parseItemQuantity(draft.quantity), price = parseItemQuantity(draft.price);
    const current = inventory.items.find(item => inventoryEntryKey(item) === inventoryEntryKey(draft.item));
    const total = quantity === null || price === null ? null : marketCost(quantity, price);
    if (quantity === null || price === null || total === null || quantity > (current?.quantity ?? draft.item.quantity)) { valid = false; continue; }
    entries.push({ entry_id: draft.item.id, entry_type: draft.item.entry_type, quantity, unit_price: price });
    gross += BigInt(total); fee += BigInt(marketFee(total)); units += BigInt(quantity);
  }
  const locked = mutation.pending || !!mutation.result.retry || !!mutation.blocked;
  function update(item: InventoryEntry, changes: Partial<Omit<Draft, "item">>) {
    setDrafts(current => {
      const key = inventoryEntryKey(item);
      const previous = current[key] ?? { item, selected: false, quantity: "1", price: "" };
      return { ...current, [key]: { ...previous, item, ...changes } };
    });
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (mutation.result.retry) mutation.run();
    else if (valid) mutation.run({ action: "create", entries });
  }
  return <section className="o-panel">
    <div className="o-panel-title"><h2>Add Listings</h2><small>Select items from your inventory</small></div>
    <MarketFeedback mutation={mutation} />
    <form noValidate onSubmit={submit} aria-label="Add market listings">
      <div className="o-market-add-summary">
        <p>You are adding <strong>{numbers.format(units)} items</strong> across <strong>{selected.length} listings</strong> for a total of <strong>{numbers.format(gross)} Gold Coins</strong>.</p>
        <p>The sale fee is {gameplay.marketplace.feeBps / 100}% ({numbers.format(fee)} Gold Coins if all selected items sell), deducted from your proceeds.</p>
        <div><button className="o-training-button" type="submit" disabled={mutation.pending || !!mutation.blocked || (!mutation.result.retry && !valid)}>
          {mutation.pending ? "Adding..." : mutation.result.retry ? "Retry listings" : "Add to Market"}
        </button><button className="o-text-button" type="button" disabled={locked || !selected.length} onClick={() => setDrafts({})}>Clear all</button></div>
        {selected.length > gameplay.marketplace.maxBatchSize && <p className="o-field-error">Select at most {gameplay.marketplace.maxBatchSize} listings at once.</p>}
        {selected.length > 0 && !valid && <p className="o-form-hint">Every selected item needs an available quantity and a positive whole-number unit price.</p>}
      </div>
      <div className="o-market-add-categories"><MarketCategories filters={filters} mode="add" /></div>
      <div className="o-market-sale-list" role="list" aria-label="Sellable items">
        {inventory.items.map(item => {
          const key = inventoryEntryKey(item);
          const draft = drafts[key] ?? { selected: false, quantity: "1", price: "" };
          return <div key={key} className="o-market-sale-row" role="listitem" data-entry-id={item.id} data-selected={draft.selected}>
            <ItemImage item={item} />
            <div className="o-market-sale-name"><strong>{item.name}{item.entry_type === "stack" && " x" + formatItemCount(item.quantity)}</strong>
              {item.stats && <small>Damage {formatItemStat(item.stats.damage)} · Accuracy {formatItemStat(item.stats.accuracy)}</small>}
            </div>
            <label className="o-market-select"><input type="checkbox" aria-label={"Select " + item.name} checked={draft.selected} disabled={locked}
              onChange={event => update(item, { selected: event.target.checked })} /><span className="sr-only">Select</span></label>
            {item.entry_type === "stack" ? <input type="text" inputMode="numeric" pattern="[0-9]+" maxLength={16}
              aria-label={"Quantity of " + item.name} placeholder="Qty" value={draft.quantity} readOnly={locked}
              onChange={event => update(item, { quantity: event.target.value, selected: true })} /> : <span className="o-market-single">1 item</span>}
            <label className="o-market-unit-price"><span className="sr-only">Unit price for {item.name}</span><input type="text" inputMode="numeric" pattern="[0-9]+" maxLength={16}
              aria-label={"Unit price for " + item.name} placeholder="Price each" value={draft.price} readOnly={locked}
              onChange={event => update(item, { price: event.target.value, selected: true })} /></label>
          </div>;
        })}
      </div>
      {!inventory.total && <p className="o-market-empty">No sellable items match this selection.</p>}
    </form>
    <div className="o-market-add-search"><MarketSearch filters={filters} mode="add" /><p>Prices are per item in Gold Coins. Selections are kept when changing categories or pages.</p></div>
    <MarketPages mode="add" page={inventory.page} pageSize={inventory.page_size} total={inventory.total} filters={filters} />
  </section>;
}
