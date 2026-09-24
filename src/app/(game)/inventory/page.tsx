import { InventoryPanel } from "@/components/inventory/inventory-panel";
import { Package } from "lucide-react";
import { PageHero, PLACEHOLDER_HERO } from "@/components/page-hero";
import { requireCharacter } from "@/lib/player";
import { createClient } from "@/lib/supabase/server";
import { withDatabaseRetry } from "@/lib/database-retry";
import { inventoryFilters } from "@/lib/inventory";

export const metadata = { title: "Inventory" };

export default async function InventoryRoute({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const character = await requireCharacter({ allowHospital: true, allowSea: true });
  const filters = inventoryFilters(await searchParams);
  const client = await createClient();
  const { data, error } = await withDatabaseRetry(() => client.rpc("list_inventory", {
    category_id: filters.category ?? undefined, search_term: filters.query, requested_page: filters.page,
  }));
  if (error || !data) throw new Error("Your inventory could not be loaded. Please try again.");
  return <>
    <PageHero title="Inventory" lead="Everything your captain carries." image={PLACEHOLDER_HERO} icon={Package} />
    <InventoryPanel inventory={data} filters={filters} characterId={character.id} />
  </>;
}
