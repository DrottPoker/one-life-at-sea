import { AddListings } from "@/components/marketplace/add-listings";
import { requireCharacter } from "@/lib/player";
import { createClient } from "@/lib/supabase/server";
import { marketFilters } from "@/lib/marketplace";

export const metadata = { title: "Add Listings" };
export default async function AddMarketListingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireCharacter();
  const filters = marketFilters(await searchParams), client = await createClient();
  const { data, error } = await client.rpc("list_market_inventory", { category_id: filters.category ?? undefined, search_term: filters.query, requested_page: filters.page });
  if (error || !data) throw new Error("Your sellable items could not be loaded. Please try again.");
  return <AddListings inventory={data} filters={filters} />;
}
