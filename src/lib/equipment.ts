import { frontend, gameplay } from "@/config/public";

export const CREW_SLOTS = ["firearm", "melee", "head", "body", "legs", "feet"] as const;
export const SHIP_SLOTS = ["cannons", "hull", "sails"] as const;
export const EQUIPMENT_SLOTS = [...CREW_SLOTS, ...SHIP_SLOTS] as const;
export type EquipmentSlot = typeof EQUIPMENT_SLOTS[number];
export const SLOT_LABELS: Record<EquipmentSlot, string> = {
  firearm: "Firearm", melee: "Melee", head: "Head", body: "Body", legs: "Legs", feet: "Feet", cannons: "Cannons", hull: "Hull", sails: "Sails",
};

export type ItemStats = { quality: number; damage?: number; precision?: number; armor?: number; health?: number; speed?: number; shots?: number };
export type LoadoutItem = ItemStats & { entry_id?: string; item_id?: string; name: string; image_path?: string };
export type Loadout = Partial<Record<EquipmentSlot, LoadoutItem>>;
// Opponents only see equipment names during a fight.
export type RevealedItem = { name: string };
export type CombatLoadout = Partial<Record<EquipmentSlot, LoadoutItem | RevealedItem>>;
export const hasStats = (item: LoadoutItem | RevealedItem | undefined): item is LoadoutItem => !!item && "quality" in item;
export type EquipReceipt = { action: "equip" | "unequip"; entry_id: string; slot: EquipmentSlot; name: string; replaced_entry_id?: string | null };
export type EquipResult = { message?: string; error?: boolean; retry?: boolean; receipt?: EquipReceipt };

export type StatKey = Exclude<keyof ItemStats, "quality">;
// Mirrors the definition constraint: each slot requires exactly these stats.
export const SLOT_STATS: Record<EquipmentSlot, StatKey[]> = {
  firearm: ["damage", "precision", "shots"], melee: ["damage", "precision"], cannons: ["damage", "precision"],
  head: ["armor"], body: ["armor"], legs: ["armor"], feet: ["armor"], hull: ["armor", "health"], sails: ["armor", "speed"],
};
const STAT_ORDER: StatKey[] = ["damage", "precision", "shots", "armor", "health", "speed"];
export const STAT_NAMES: Record<StatKey, string> = { damage: "Damage", precision: "Precision", shots: "Shots", armor: "Armor", health: "Ship Health", speed: "Speed" };
const decimals = new Intl.NumberFormat(frontend.site.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const whole = new Intl.NumberFormat(frontend.site.locale, { maximumFractionDigits: 0 });

export const fallbackWeapons = gameplay.equipment.fallbackWeapons;
export const hitZones = gameplay.equipment.zones;

export function isEquipmentSlot(value: unknown): value is EquipmentSlot {
  return typeof value === "string" && EQUIPMENT_SLOTS.some(slot => slot === value);
}

export function formatQuality(value: number) {
  return decimals.format(value) + "%";
}

// Labels and display values for the stats an item actually has, in a fixed reading order.
export function itemStatRows(stats: ItemStats) {
  return STAT_ORDER.filter(key => stats[key] !== undefined).map(key => {
    const value = stats[key]!;
    const text = key === "shots" || key === "health" ? (key === "health" ? "+" : "") + whole.format(value)
      : key === "armor" || key === "speed" ? (key === "speed" ? "+" : "") + decimals.format(value) + "%" : decimals.format(value);
    return { key, label: STAT_NAMES[key], text };
  });
}

export function itemStatSummary(stats: ItemStats) {
  return ["Quality " + formatQuality(stats.quality), ...itemStatRows(stats).map(row => row.label + " " + row.text)].join(" · ");
}

export function zoneName(group: "crew" | "ship", id: string | null | undefined) {
  return hitZones[group].find(zone => zone.id === id)?.name ?? null;
}
