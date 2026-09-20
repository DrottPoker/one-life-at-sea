import { OwnMarketListings } from "@/components/marketplace/market-listings";
import { MarketPages } from "@/components/marketplace/market-shell";
import { requireCharacter } from "@/lib/player";
import { createClient } from "@/lib/supabase/server";
import { marketFilters } from "@/lib/marketplace";

export const metadata = { title: "Your Listings" };
export default async function YourMarketListingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireCharacter();
  const filters = marketFilters(await searchParams), client = await createClient();
  const { data, error } = await client.rpc("list_market_listings", { own_only: true, requested_page: filters.page });
  if (error || !data) throw new Error("Your listings could not be loaded. Please try again.");
  return <section className="o-panel">
    <div className="o-panel-title"><h2>Your Listings</h2><small>Items currently for sale</small></div>
    <OwnMarketListings listings={data} />
    <MarketPages mode="listings" page={data.page} pageSize={data.page_size} total={data.total} filters={filters} />
  </section>;
}
