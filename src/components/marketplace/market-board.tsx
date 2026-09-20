"use client";

import { useEffect, useRef, useState } from "react";
import { Coins, Eye, ShoppingCart } from "lucide-react";
import { gameplay } from "@/config/public";
import { ItemImage } from "@/components/inventory/item-image";
import { ItemDetails } from "@/components/inventory/item-details";
import { MarketCategories, MarketPages, MarketSearch } from "@/components/marketplace/market-shell";
import { MarketFeedback, MarketListings } from "@/components/marketplace/market-listings";
import { useMarketMutation } from "@/components/marketplace/use-market-mutation";
import { formatGold } from "@/lib/bank";
import { formatCirculation } from "@/lib/circulation";
import { inventoryCategoryName, type InventoryEntry, type InventoryFilters } from "@/lib/inventory";
import type { MarketItem, MarketPage } from "@/lib/marketplace";

export function MarketBoard({ market, filters }: { market: MarketPage<MarketItem>; filters: InventoryFilters }) {
  const [expanded, setExpanded] = useState<{ id: string; kind: "details" | "listings" } | null>(null);
  const [columns, setColumns] = useState(5);
  const grid = useRef<HTMLDivElement>(null), mutation = useMarketMutation();
  useEffect(() => {
    const element = grid.current;
    if (!element) return;
    const measure = () => setColumns(Math.max(1, getComputedStyle(element).gridTemplateColumns.split(" ").filter(Boolean).length));
    const observer = new ResizeObserver(measure);
    observer.observe(element); measure();
    return () => observer.disconnect();
  }, []);
  const selected = market.items.find(item => item.item_id === expanded?.id);
  const selectedIndex = market.items.findIndex(item => item.item_id === expanded?.id);
  const afterIndex = Math.min(market.items.length - 1, Math.ceil((selectedIndex + 1) / columns) * columns - 1);
  function toggle(item: MarketItem, kind: "details" | "listings") {
    setExpanded(current => current?.id === item.item_id && current.kind === kind ? null : { id: item.item_id, kind });
  }
  function details(item: MarketItem): InventoryEntry {
    return { ...item, id: item.item_id, entry_type: item.kind === "equipment" ? "instance" : "stack", quantity: 0, stats: null };
  }
  const title = filters.category ? inventoryCategoryName(filters.category) : "Most Popular";
  return <div className="o-market-layout">
    <aside className="o-market-sidebar"><MarketSearch filters={filters} /><MarketCategories filters={filters} /></aside>
    <section className="o-panel o-market-catalog" aria-label={title}>
      <div className="o-panel-title"><h2>{title}</h2><small>{filters.category ? "Lowest price first" : "Units sold in the last " + gameplay.marketplace.popularityHours + " hours"}</small></div>
      <MarketFeedback mutation={mutation} />
      <div className="o-market-grid" ref={grid}>
        {market.items.flatMap((item, index) => [
          <article key={"item-" + item.item_id} className="o-market-card" data-item-id={item.item_id} data-expanded={expanded?.id === item.item_id}>
            <div className="o-market-card-art">
              <ItemImage item={details(item)} />
              <div className="o-market-card-actions">
                <button type="button" aria-label={"View " + item.name + " details"} aria-expanded={expanded?.id === item.item_id && expanded.kind === "details"}
                  onClick={() => toggle(item, "details")}><Eye aria-hidden="true" /></button>
                <button type="button" aria-label={"View " + item.name + " listings"} aria-expanded={expanded?.id === item.item_id && expanded.kind === "listings"}
                  onClick={() => toggle(item, "listings")}><ShoppingCart aria-hidden="true" /></button>
              </div>
            </div>
            <h3 title={item.name}>{item.name}</h3>
            <p className="o-market-card-price" title={item.minimum_price === null ? "No listings" : formatGold(item.minimum_price) + " Gold Coins each"}
              aria-label={(item.minimum_price === null ? "No listings" : formatGold(item.minimum_price) + " Gold Coins") + ", " + formatCirculation(item.available) + " available"}>
              {item.minimum_price !== null && <Coins aria-hidden="true" />}
              <span>{item.minimum_price === null ? "No listings" : formatGold(item.minimum_price)}</span>
              <span className="o-market-card-count">({formatCirculation(item.available)})</span>
            </p>
          </article>,
          selected && index === afterIndex && <div key={"expanded-" + selected.item_id} className="o-market-expanded">
            {expanded?.kind === "details" ? <ItemDetails item={details(selected)} quantityLabel="Available" quantityDisplay={formatCirculation(selected.available)} onClose={() => setExpanded(null)} /> :
              <MarketListings key={selected.item_id} itemId={selected.item_id} itemName={selected.name} observedAt={market.observed_at} mutation={mutation} onClose={() => setExpanded(null)} />}
          </div>,
        ])}
      </div>
      {!market.total && <p className="o-market-empty">No items match this selection. Try another category or search.</p>}
      <MarketPages page={market.page} pageSize={market.page_size} total={market.total} filters={filters} />
    </section>
  </div>;
}
