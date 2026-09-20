import { MarketBoard } from "@/components/marketplace/market-board";
import { requireCharacter } from "@/lib/player";
import { createClient } from "@/lib/supabase/server";
import { marketFilters } from "@/lib/marketplace";

export const metadata = { title: "Marketplace" };
export default async function MarketplacePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireCharacter();
  const filters = marketFilters(await searchParams), client = await createClient();
  const { data, error } = await client.rpc("list_market_items", { category_id: filters.category ?? undefined, search_term: filters.query, requested_page: filters.page });
  if (error || !data) throw new Error("The marketplace could not be loaded. Please try again.");
  return <MarketBoard market={data} filters={filters} />;
}
