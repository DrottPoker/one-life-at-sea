export type AdminValues = Record<string, string | null>;
export type AdminRow = { version: string; values: AdminValues };
export type AdminResource = {
  name: string; schema: string; table: string; editable: string[]; deletable: boolean; note: string;
  columns: { name: string; type: string; nullable: boolean; primary: boolean }[];
};
export type AdminPage = { rows: AdminRow[]; total: string; page: number; page_size: number };
export type AdminAction = "update" | "delete" | "grant_items" | "cancel_ship_job" | "end_combat" | "release_hospital" | "save_item" | "save_loot_table" | "save_activity_loot";
export type AdminJson = string | number | boolean | null | AdminJson[] | { [key: string]: AdminJson };
export type AdminPayload = Record<string, AdminJson>;
export type AdminReceipt = { audit_id: string; message: string; id?: string };
export type AdminResult = { message: string; error?: boolean; retry?: boolean; receipt?: AdminReceipt };

export function rowKey(resource: AdminResource, row: AdminRow): AdminValues {
  return Object.fromEntries(resource.columns.filter(column => column.primary).map(column => [column.name, row.values[column.name]]));
}

export function changedValues(original: AdminValues, edited: AdminValues): AdminValues {
  return Object.fromEntries(Object.entries(edited).filter(([key, value]) => value !== original[key]));
}

export function adminPageNumber(value: string | undefined): number {
  if (!value || !/^\d+$/.test(value)) return 0;
  const page = Number(value);
  return Number.isSafeInteger(page) && page <= 2147483647 ? page : 0;
}

export const adminErrors: Record<string, string> = {
  INVALID_CONTENT_ID: "Choose an identifier other than new; it is reserved for the creation page.",
  ITEM_SHAPE_LOCKED: "An existing item's type and equipment slot cannot be changed.",
  ITEM_IN_LOOT: "Remove this item from active loot tables before disabling it.",
  INVALID_IMAGE: "Upload an image or select the default image.",
  INVALID_LOOT: "Add between 1 and 50 distinct items to this loot table.",
  INVALID_LOOT_TOTAL: "Fixed chances must total at most 100%. Weighted items must cover the remaining chance at both levels.",
  LOOT_IN_USE: "Unlink this table from its activities before disabling it.",
  LOOT_UNAVAILABLE: "Select an active loot table with valid items.",
  INVALID_CHARACTER_NAME: "Use a character name without numbers or spaces.",
  ADMIN_REQUIRED: "Administrator access is required. Your access may have been revoked.",
  STALE_ROW: "This record changed after you opened it. Reload the record before editing again.",
  ROW_NOT_FOUND: "This record no longer exists. Reload the page.",
  SHIP_JOB_FINISHED: "This ship job has finished. Its result applies to the captain and it can no longer be cancelled.",
  READ_ONLY_RESOURCE: "This table is maintained by the game and cannot be edited here.",
  READ_ONLY_COLUMN: "One of these columns cannot be changed.",
  PLAYER_IN_COMBAT: "End this player's active combat before changing character values.",
  INVALID_REQUEST: "Enter a reason of 3-500 characters and check the request.",
  INVALID_CHANGES: "Change at least one editable field.",
  INVALID_KEY: "The selected record is invalid. Reload the page.",
  INVALID_QUANTITY: "Enter a whole quantity from 1 to 1,000,000.",
  EQUIPMENT_LIMIT: "Generate at most 100 equipment instances per request.",
  INVALID_STATS: "Check the equipment stats: each slot needs its own stat ranges within the configured limits, and Quality must be 0-100, with at most two decimal places.",
  INVALID_ITEM: "Select an active item definition.",
  REQUEST_CONFLICT: "This request has already been used with different values. Reload the page.",
  INVALID_ACTION: "This admin operation is not supported.",
};


const fieldLabels: Record<string, string> = {
  display_name: "Captain name", gold_coins: "Gold Coins", bank_gold_coins: "Bank balance", energy: "Energy", stamina: "Stamina",
  crew_morale: "Crew Morale", ship_health: "Ship Health", crew_health: "Crew Health", player_number: "Player ID", xp: "Skill XP",
  training_xp: "Training XP", purchased_tier: "Purchased tier", category_id: "Category", item_id: "Item", image_path: "Image",
  effect_description: "Effect description", loot_table_id: "Loot table", activity_id: "Activity", success_start: "Catch chance at level 1 (%)",
  success_end: "Catch chance at mastery (%)", mastery_level: "Mastery level", managed_by_admin: "Managed in admin",
};
export function adminLabel(name: string) {
  return fieldLabels[name] ?? name.replaceAll("_", " ").replace(/^./, letter => letter.toUpperCase());
}
export function adminResourceGroup(name: string) {
  if (name.startsWith("admin_")) return "Audit and access";
  if (name.startsWith("forum_")) return "Forum";
  if (name.endsWith("requests") || name.includes("history") || name === "bank_transfers" || name === "market_sales") return "History and receipts";
  if (name.includes("loot") || name.includes("definitions") || name.includes("categories") || name.includes("tiers") || name === "skill_levels") return "Game content";
  if (name.startsWith("combat") || name === "ship_upgrade_jobs" || name === "hospital_patients") return "Combat and travel";
  return "Players and inventory";
}
