"use client";

import { GameLink as Link } from "@/components/game-navigation";
import { useEffect, useState, type FormEvent } from "react";
import { ShoppingCart, X } from "lucide-react";
import { ItemImage } from "@/components/inventory/item-image";
import { useGameState } from "@/components/game-state";
import { useMarketMutation } from "@/components/marketplace/use-market-mutation";
import { createClient } from "@/lib/supabase/browser";
import { formatGold } from "@/lib/bank";
import { formatItemCount, parseItemQuantity } from "@/lib/inventory";
import { itemStatSummary } from "@/lib/equipment";
import { affordableQuantity, marketCost, type MarketListing, type MarketPage } from "@/lib/marketplace";

export type MarketMutation = ReturnType<typeof useMarketMutation>;

export function MarketFeedback({ mutation }: { mutation: MarketMutation }) {
  return <div className="o-market-feedback" role="status" aria-live="polite">
    {mutation.blocked && <p className="o-inventory-notice">{mutation.blocked} You can still inspect items and listings.</p>}
    {mutation.result.message && <p className={mutation.result.error ? "o-field-error" : "o-copy"}>{mutation.result.message}</p>}
    {mutation.result.retry && <button className="o-training-button" disabled={mutation.pending || !!mutation.blocked}
      onClick={() => mutation.run()}>{mutation.pending ? "Confirming..." : "Retry trade"}</button>}
  </div>;
}

function BuyRow({ listing, mutation, stale }: { listing: MarketListing; mutation: MarketMutation; stale: boolean }) {
  const state = useGameState(), [quantity, setQuantity] = useState("1");
  const amount = parseItemQuantity(quantity);
  const total = amount === null ? null : marketCost(amount, listing.unit_price);
  const maximum = affordableQuantity(state.gold_coins, listing.unit_price, listing.quantity);
  const locked = !!mutation.blocked || mutation.pending || !!mutation.result.retry || stale || listing.is_own;
  function buy(event: FormEvent) {
    event.preventDefault();
    if (locked || amount === null || amount > maximum || total === null) return;
    mutation.run({ action: "buy", listing_id: listing.id, quantity: amount, expected_unit_price: listing.unit_price });
  }
  return <tr data-listing-id={listing.id}>
    <td className="o-market-listing-art"><ItemImage item={listing} /></td>
    <td className="o-market-seller"><Link href={"/players/" + listing.seller_player_number} title={listing.seller_name} prefetch={false}>{listing.seller_name}</Link><small className="o-player-number"> [{listing.seller_player_number}]</small>
      {listing.stats && <small>{itemStatSummary(listing.stats)}</small>}
    </td>
    <td className="o-market-price" title="Gold Coins each">{formatGold(listing.unit_price)}<span className="sr-only"> Gold Coins each</span></td>
    <td className="o-market-stock">{formatItemCount(listing.quantity)} available
      <button type="button" className="o-text-button" disabled={locked || maximum === 0} onClick={() => setQuantity(String(maximum))}>Fill Max</button>
    </td>
    <td><form onSubmit={buy} className="o-market-buy">
      <input aria-label={"Quantity from " + listing.seller_name} type="text" inputMode="numeric" pattern="[0-9]+" maxLength={16}
        value={quantity} readOnly={locked} onChange={event => setQuantity(event.target.value)} />
      <button type="submit" className="o-training-button" title={total === null ? "Enter a valid quantity" : "Total: " + formatGold(total) + " Gold Coins"} aria-label={"Buy " + listing.name + " from " + listing.seller_name}
        disabled={locked || amount === null || amount > maximum || total === null}><ShoppingCart aria-hidden="true" />{listing.is_own ? "Yours" : "Buy"}</button>
      <span className="sr-only">{total === null ? "Enter a valid quantity" : "Total: " + formatGold(total) + " Gold Coins"}</span>
    </form></td>
  </tr>;
}

export function MarketListings({ itemId, itemName, observedAt, mutation, onClose }: {
  itemId: string; itemName: string; observedAt: string; mutation: MarketMutation; onClose: () => void;
}) {
  const [page, setPage] = useState(0), [attempt, setAttempt] = useState(0);
  const requestKey = observedAt + ":" + page + ":" + attempt;
  const [snapshot, setSnapshot] = useState<{ requestKey: string; data: MarketPage<MarketListing> | null; error: boolean } | null>(null);
  useEffect(() => {
    const controller = new AbortController(), client = createClient();
    async function load() {
      try {
        const { data, error } = await client.rpc("list_market_listings", { target_item: itemId, requested_page: page }).abortSignal(controller.signal);
        if (!controller.signal.aborted) setSnapshot(old => ({ requestKey, data: data ?? old?.data ?? null, error: !!error || !data }));
      } catch {
        if (!controller.signal.aborted) setSnapshot(old => ({ requestKey, data: old?.data ?? null, error: true }));
      }
    }
    void load();
    return () => controller.abort();
  }, [itemId, page, requestKey]);
  const data = snapshot?.data, loading = snapshot?.requestKey !== requestKey;
  const hasMore = !!data && data.items.length < data.total;
  return <section className="o-market-offers" aria-label={itemName + " listings"}>
    <div className="o-market-section-title"><h3>{itemName} listings <small>Gold Coins each</small></h3>
      <button type="button" className="o-item-icon-button" aria-label="Close listings" onClick={onClose}><X aria-hidden="true" /></button>
    </div>
    {snapshot?.error && <p className="o-field-error" role="status">Listings could not be updated. <button className="o-text-button" disabled={loading} onClick={() => setAttempt(a => a + 1)}>Retry listings</button></p>}
    {!data && !snapshot?.error && <p className="o-panel-body" role="status">Loading listings...</p>}
    {data && <>
      {!data.total ? <p className="o-market-empty">No listings are available for this item.</p> : <div className="o-market-table-wrap">
        <table className="o-market-table">
          <colgroup><col className="o-market-col-art" /><col /><col className="o-market-col-price" /><col className="o-market-col-stock" /><col className="o-market-col-buy" /></colgroup>
          <thead className="sr-only"><tr><th aria-label="Item" /><th>Seller / stats</th><th>Price in Gold Coins</th><th>Stock</th><th>Purchase</th></tr></thead>
          <tbody>{data.items.map(listing => <BuyRow key={listing.id} listing={listing} mutation={mutation} stale={snapshot?.error ?? false} />)}</tbody>
        </table></div>}
      {hasMore && <div className="o-market-more">
        <button type="button" className="o-text-button" disabled={loading || !!snapshot?.error}
          onClick={() => setPage(current => current + 1)}>Show more listings</button>
      </div>}
      {loading && <span className="sr-only" role="status">Updating listings...</span>}
    </>}
  </section>;
}

export function OwnMarketListings({ listings }: { listings: MarketPage<MarketListing> }) {
  const mutation = useMarketMutation();
  return <>
    <MarketFeedback mutation={mutation} />
    <p className="o-market-note">Unsold items are held on the market. Cancel a listing to return its remaining items to your inventory.</p>
    {!listings.total ? <p className="o-market-empty">You have no active listings.</p> : <div className="o-market-own-list" role="list" aria-label="Your active listings">
      {listings.items.map(listing => <div key={listing.id} className="o-market-own-row" role="listitem" data-listing-id={listing.id}>
        <ItemImage item={listing} />
        <div className="o-market-own-name"><strong>{listing.name}</strong>
          {listing.stats && <small>{itemStatSummary(listing.stats)}</small>}
          {!listing.tradable && <small>Trading is unavailable. You can still cancel this listing.</small>}
        </div>
        <div>{formatItemCount(listing.quantity)} available<small>{formatGold(listing.unit_price)} Gold Coins each</small></div>
        <button className="o-item-action" disabled={mutation.pending || !!mutation.result.retry || !!mutation.blocked}
          onClick={() => mutation.run({ action: "cancel", listing_id: listing.id })}>Cancel listing</button>
      </div>)}
    </div>}
  </>;
}
