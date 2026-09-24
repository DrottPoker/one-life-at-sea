"use client";

import { GameLink as Link } from "@/components/game-navigation";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type FormEvent, type ReactNode } from "react";
import { PageHero, PLACEHOLDER_HERO } from "@/components/page-hero";
import { ArrowLeft, List, ListPlus, Search, Store, Flame, Package, Swords, CircleDot, Cross, FlaskConical, Boxes, Compass } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { useGameRefresh } from "@/components/game-refresh";
import { inventoryCategories, type InventoryFilters } from "@/lib/inventory";
import { MARKET_PATH, marketHref, type MarketMode } from "@/lib/marketplace";

const icons: Record<string, typeof Package> = { swords: Swords, cannon: CircleDot, cross: Cross, flask: FlaskConical, boxes: Boxes, compass: Compass };

export function MarketShell({ children }: { children: ReactNode }) {
  const pathname = usePathname(), { request } = useGameRefresh();
  useEffect(() => {
    const client = createClient();
    let disposed = false;
    const channel = client.channel("market-events", { config: { postgres_changes_options: { wait: true } } })
      .on("postgres_changes", { event: "*", schema: "public", table: "market_item_events" }, request);
    void client.realtime.setAuth().then(() => {
      if (!disposed) channel.subscribe(status => { if (status === "SUBSCRIBED") request(); });
    }).catch(() => { if (!disposed) request(); });
    return () => { disposed = true; void client.removeChannel(channel); };
  }, [request]);
  return <div className="o-market">
    <PageHero title="Marketplace" lead="Buy and sell goods with other captains." image={PLACEHOLDER_HERO} icon={Store} />
    <div className="o-market-top"><nav aria-label="Marketplace">
      {pathname !== MARKET_PATH && <Link href={MARKET_PATH}><ArrowLeft aria-hidden="true" />Back to Item Market</Link>}
      <Link href={marketHref("add")} aria-current={pathname.endsWith("/add") ? "page" : undefined}><ListPlus aria-hidden="true" />Add Listings</Link>
      <Link href={marketHref("listings")} aria-current={pathname.endsWith("/listings") ? "page" : undefined}><List aria-hidden="true" />View Your Listings</Link>
    </nav></div>
    {children}
  </div>;
}

export function MarketSearch({ filters, mode = "browse" }: { filters: InventoryFilters; mode?: MarketMode }) {
  const router = useRouter();
  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push(marketHref(mode, filters.category, String(new FormData(event.currentTarget).get("q") ?? "").trim().slice(0, 100)));
  }
  return <form className="o-market-search" role="search" aria-label="Search marketplace" onSubmit={search}>
    <input key={filters.query} name="q" type="search" aria-label="Search market items" placeholder="Search for an item..." defaultValue={filters.query} maxLength={100} autoComplete="off" />
    <button aria-label="Search market"><Search aria-hidden="true" /></button>
  </form>;
}

export function MarketCategories({ filters, mode = "browse" }: { filters: InventoryFilters; mode?: MarketMode }) {
  return <nav className="o-market-categories" aria-label="Market categories">
    <Link href={marketHref(mode, null, filters.query)} aria-current={!filters.category ? "page" : undefined}>
      {mode === "browse" ? <Flame aria-hidden="true" /> : <Package aria-hidden="true" />}{mode === "browse" ? "Most Popular" : "All items"}
    </Link>
    {inventoryCategories.map(category => {
      const Icon = icons[category.icon] ?? Package;
      return <Link key={category.id} href={marketHref(mode, category.id, filters.query)} aria-current={filters.category === category.id ? "page" : undefined}>
        <Icon aria-hidden="true" />{category.name}</Link>;
    })}
  </nav>;
}

export function MarketPages({ page, pageSize, total, filters, mode = "browse" }: {
  page: number; pageSize: number; total: number; filters: InventoryFilters; mode?: MarketMode;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return <div className="o-inventory-footer"><span>{total} {mode === "listings" ? "listings" : "items"}</span>
    {pages > 1 && <nav aria-label="Market pages">
      {page > 0 && <Link href={marketHref(mode, filters.category, filters.query, page - 1)}>Previous</Link>}
      <span>Page {page + 1} of {pages}</span>
      {page + 1 < pages && <Link href={marketHref(mode, filters.category, filters.query, page + 1)}>Next</Link>}
    </nav>}
  </div>;
}
