import { isUuid } from "@/lib/validation";
import { isMarketCommand, type MarketCommand } from "@/lib/marketplace";

export type EconomyFormKind = "bank" | "inventory" | "training" | "tavern" | "activity" | "crafting";
export type EconomyRequest = { kind: "market"; id: string; command: MarketCommand } |
  { kind: EconomyFormKind; id: string; fields: Record<string, string> };
type Outcome = { error?: boolean; retry?: boolean; message?: string };
type Failure = { error: true; retry?: boolean; message: string };
type JournalStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const formKeys: Record<EconomyFormKind, string[]> = {
  crafting: ["request_id", "recipe_id", "expected_version"],
  activity: ["request_id", "activity_id", "stamina_cost", "xp_gain"],
  tavern: ["request_id", "gold_cost", "morale_gain"],
  bank: ["request_id", "direction", "amount"],
  inventory: ["request_id", "entry_id", "entry_type", "quantity"],
  training: ["request_id", "action", "stat", "group", "tier_id", "energy_amount"],
};

export const economyJournalKey = (characterId: string) => "one-life-at-sea:economy-request:" + characterId;

export function formRequest(kind: EconomyFormKind, form: FormData): Extract<EconomyRequest, { kind: EconomyFormKind }> {
  const fields = Object.fromEntries(formKeys[kind].filter(key => form.has(key)).map(key => [key, String(form.get(key))]));
  return { kind, id: fields.request_id, fields };
}

export function requestForm(fields: Record<string, string>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
}

export function parseEconomyRequest(raw: string | null): EconomyRequest | null {
  if (raw === null) return null;
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object") throw Error("Invalid saved request.");
  const request = value as Record<string, unknown>;
  if (!isUuid(request.id)) throw Error("Invalid saved request ID.");
  if (request.kind === "market" && isMarketCommand(request.command) && request.command.request_id === request.id) {
    return { kind: "market", id: request.id, command: request.command };
  }
  if (request.kind !== "bank" && request.kind !== "inventory" && request.kind !== "training" && request.kind !== "tavern" && request.kind !== "activity" && request.kind !== "crafting") throw Error("Invalid saved action.");
  if (!request.fields || typeof request.fields !== "object" || Array.isArray(request.fields)) throw Error("Invalid saved fields.");
  const fields = request.fields as Record<string, unknown>;
  if (fields.request_id !== request.id || !Object.entries(fields).every(([key, value]) =>
    formKeys[request.kind as EconomyFormKind].includes(key) && typeof value === "string" && value.length <= 200)) {
    throw Error("Invalid saved fields.");
  }
  return { kind: request.kind, id: request.id, fields: fields as Record<string, string> };
}

// Caller holds the browser lock for this character until the response is recorded.
export async function executeSavedRequest<T extends Outcome>(
  storage: JournalStorage, key: string, request: EconomyRequest, execute: () => Promise<T>, changed: () => void,
): Promise<T | Failure> {
  try {
    const saved = parseEconomyRequest(storage.getItem(key));
    if (saved && JSON.stringify(saved) !== JSON.stringify(request)) {
      return { error: true, message: "Check the saved action before making another change." };
    }
    parseEconomyRequest(JSON.stringify(request));
    storage.setItem(key, JSON.stringify(request));
    changed();
  } catch {
    return { error: true, message: "Your action could not be saved safely in this browser. Check browser storage before trying again." };
  }
  let result: T;
  try { result = await execute(); }
  catch {
    return { error: true, retry: true, message: "The result could not be confirmed. Your action is saved. Retry it safely to check the same request." };
  }
  if (!result.retry) {
    try { storage.removeItem(key); changed(); }
    catch {
      return { error: true, retry: true, message: "The response arrived, but the saved action could not be cleared. Check it again safely." };
    }
  }
  return result;
}
