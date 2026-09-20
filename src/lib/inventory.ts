import { frontend, gameplay } from "@/config/public";

export type InventoryEntryType = "stack" | "instance";
export type InventoryEntry = {
  id: string; entry_type: InventoryEntryType; item_id: string; quantity: number;
  name: string; category_id: string; kind: "equipment" | "consumable" | "passive";
  description: string; effect_description: string; image_path: string;
  stats: { damage: number; accuracy: number } | null;
  circulation: string; market_value: string | null;
};
export type InventoryPage = { items: InventoryEntry[]; total: number; page: number; page_size: number };
export type InventoryFilters = { category: string | null; query: string; page: number };
export type TrashReceipt = { entry_id: string; entry_type: InventoryEntryType; name: string; quantity: number; remaining: number };
export type TrashResult = { message?: string; error?: boolean; retry?: boolean; receipt?: TrashReceipt };

export const inventoryCategories = gameplay.inventory.categories;
const numbers = new Intl.NumberFormat(frontend.site.locale);
const stats = new Intl.NumberFormat(frontend.site.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const formatItemCount = (value: number) => numbers.format(value);
export const formatItemStat = (value: number) => stats.format(value);
export const inventoryEntryKey = (entry: InventoryEntry) => entry.entry_type + "-" + entry.id;
export const inventoryCategoryName = (id: string | null) => inventoryCategories.find(c => c.id === id)?.name ?? "All items";

export function isInventoryEntryType(value: unknown): value is InventoryEntryType {
  return value === "stack" || value === "instance";
}
export function parseItemQuantity(value: unknown): number | null {
  if (typeof value !== "string" || !/^[0-9]+$/.test(value.trim())) return null;
  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}
export function inventoryFilters(params: Record<string, string | string[] | undefined>): InventoryFilters {
  const category = inventoryCategories.some(c => c.id === params.category) ? String(params.category) : null;
  const query = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const page = typeof params.page === "string" && /^[0-9]+$/.test(params.page) ? Number(params.page) : 0;
  return { category, query, page: Number.isSafeInteger(page) && page <= 2147483647 ? page : 0 };
}
export function inventoryHref(category: string | null, query = "", page = 0) {
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (query.trim()) params.set("q", query.trim());
  if (page > 0) params.set("page", String(page));
  return "/inventory" + (params.size ? "?" + params.toString() : "");
}
