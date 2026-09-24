import type { AdminAction, AdminJson, AdminPayload } from "@/lib/admin";
import { isUuid } from "@/lib/validation";

export type AdminRequest = { action: AdminAction; payload: AdminPayload; reason: string; id: string };
const actions: readonly AdminAction[] = ["update", "delete", "grant_items", "cancel_ship_job", "end_combat", "release_hospital", "save_item", "save_loot_table", "save_activity_loot"];

function isJson(value: unknown, depth = 0): value is AdminJson {
  if (depth > 32) return false;
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object") return false;
  return Object.values(value).every(child => isJson(child, depth + 1));
}

export function isAdminRequest(value: unknown): value is AdminRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Partial<AdminRequest>;
  if (!isUuid(request.id) || !actions.includes(request.action as AdminAction) ||
      typeof request.reason !== "string" || request.reason.trim().length < 3 || request.reason.trim().length > 500 ||
      !request.payload || typeof request.payload !== "object" || Array.isArray(request.payload) || !isJson(request.payload)) return false;
  try { return JSON.stringify(request.payload).length <= 16000; } catch { return false; }
}

export function parseAdminRequests(raw: string | null): AdminRequest[] {
  if (raw === null) return [];
  const requests: unknown = JSON.parse(raw);
  if (!Array.isArray(requests) || !requests.every(isAdminRequest) ||
      new Set(requests.map(request => request.id)).size !== requests.length) {
    throw new Error("Invalid saved admin requests.");
  }
  return requests;
}
