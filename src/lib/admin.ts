export type AdminValues = Record<string, string | null>;
export type AdminRow = { version: string; values: AdminValues };
export type AdminResource = {
  name: string; schema: string; table: string; editable: string[]; deletable: boolean; note: string;
  columns: { name: string; type: string; nullable: boolean; primary: boolean }[];
};
export type AdminPage = { rows: AdminRow[]; total: string; page: number; page_size: number };
export type AdminAction = "update" | "delete" | "grant_items" | "cancel_ship_job" | "end_combat";
export type AdminPayload = Record<string, string | null | AdminValues>;
export type AdminReceipt = { audit_id: string; message: string };
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
  ADMIN_REQUIRED: "Administrator access is required. Your access may have been revoked.",
  STALE_ROW: "This record changed after you opened it. Reload the record before editing again.",
  ROW_NOT_FOUND: "This record no longer exists. Reload the page.",
  READ_ONLY_RESOURCE: "This table is maintained by the game and cannot be edited here.",
  READ_ONLY_COLUMN: "One of these columns cannot be changed.",
  PLAYER_IN_COMBAT: "End this player's active combat before changing character values.",
  INVALID_REQUEST: "Enter a reason of 3-500 characters and check the request.",
  INVALID_CHANGES: "Change at least one editable field.",
  INVALID_KEY: "The selected record is invalid. Reload the page.",
  INVALID_QUANTITY: "Enter a whole quantity from 1 to 1,000,000.",
  EQUIPMENT_LIMIT: "Generate at most 100 equipment instances per request.",
  INVALID_STATS: "Damage must be 0-1,000,000,000 and accuracy 0-100, with at most two decimal places.",
  INVALID_ITEM: "Select an active item definition.",
  REQUEST_CONFLICT: "This request has already been used with different values. Reload the page.",
  INVALID_ACTION: "This admin operation is not supported.",
};

