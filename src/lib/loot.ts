export const DEFAULT_ITEM_IMAGE = "/images/items/placeholder.svg";
export type LootEntry = {
  item_id: string; mode: "fixed" | "weighted"; fixed_chance: number; weight_start: number; weight_end: number;
  quantity: number; damage: number; accuracy: number;
};
export type LootTable = { id: string; name: string; description: string; active: boolean; version: string; entries: LootEntry[] };
export type ActivityLoot = {
  activity_id: string; loot_table_id: string | null; success_start: number; success_end: number; mastery_level: number; version: string | null;
};
export function levelFactor(level: number, masteryLevel = 99) {
  return Math.max(0, Math.min(1, (level - 1) / (masteryLevel - 1)));
}
export function catchChance(settings: Pick<ActivityLoot, "success_start" | "success_end" | "mastery_level">, level: number) {
  return settings.success_start + (settings.success_end - settings.success_start) * levelFactor(level, settings.mastery_level);
}
export function lootChances(entries: LootEntry[], level: number, masteryLevel = 99) {
  const fixed = entries.reduce((sum, entry) => sum + (entry.mode === "fixed" ? entry.fixed_chance : 0), 0);
  const factor = levelFactor(level, masteryLevel);
  const weights = entries.map(entry => entry.mode === "weighted" ? entry.weight_start + (entry.weight_end - entry.weight_start) * factor : 0);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return entries.map((entry, i) => ({ ...entry, chance: entry.mode === "fixed" ? entry.fixed_chance : total > 0 ? (100 - fixed) * weights[i] / total : 0 }));
}
export function lootValidation(entries: LootEntry[]): string | null {
  if (!entries.length) return "Add at least one item.";
  if (entries.length > 50) return "Use at most 50 items in one table.";
  if (new Set(entries.map(entry => entry.item_id)).size !== entries.length) return "Each item can appear only once.";
  for (const entry of entries) {
    if (!entry.item_id) return "Choose an item for every row.";
    if (![entry.fixed_chance, entry.weight_start, entry.weight_end, entry.quantity, entry.damage, entry.accuracy].every(Number.isFinite)) return "Enter valid numbers in every row.";
    if (!Number.isInteger(entry.quantity) || entry.quantity < 1 || entry.quantity > 100) return "Quantity must be a whole number from 1 to 100.";
    if (entry.damage < 0 || entry.damage > 1000000000 || entry.accuracy < 0 || entry.accuracy > 100) return "Check the equipment stats.";
    if (entry.mode === "fixed" && (entry.fixed_chance <= 0 || entry.fixed_chance > 100)) return "Fixed chances must be greater than 0 and at most 100%.";
    if (entry.mode === "weighted" && (entry.weight_start < 0 || entry.weight_end < 0 || entry.weight_start > 1000000 || entry.weight_end > 1000000 || entry.weight_start + entry.weight_end === 0)) return "Weights must be 0–1,000,000, with at least one positive value per item.";
  }
  const fixed = entries.filter(entry => entry.mode === "fixed").reduce((sum, entry) => sum + entry.fixed_chance, 0);
  if (fixed > 100) return "Fixed chances cannot add up to more than 100%.";
  if (fixed < 100 && ["weight_start", "weight_end"].some(key => entries.filter(entry => entry.mode === "weighted").reduce((sum, entry) => sum + entry[key as "weight_start" | "weight_end"], 0) <= 0)) {
    return "Weighted items must cover the remaining chance at both the starting and mastery level.";
  }
  return null;
}
export function itemIdentifier(name: string) {
  let id = name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!id) return name.trim() ? "item" : "";
  if (!/^[a-z]/.test(id)) id = "item_" + id;
  return (id === "new" ? "new_item" : id).slice(0, 48);
}
