import { describe, expect, it, vi } from "vitest";
import { economyJournalKey, executeSavedRequest, parseEconomyRequest, type EconomyRequest } from "../../src/lib/economy-journal";

const id = "a9600000-0000-4000-8000-000000000001";
const request: EconomyRequest = { kind: "bank", id, fields: { request_id: id, direction: "deposit", amount: "40" } };
function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); } };
}

describe("durable economy requests", () => {
  it("persists before sending and retains the exact request after a lost response", async () => {
    const store = storage(), key = economyJournalKey(id), changed = vi.fn();
    const execute = vi.fn(async () => {
      expect(parseEconomyRequest(store.getItem(key))).toEqual(request);
      throw Error("Response lost after commit");
    });
    expect(await executeSavedRequest(store, key, request, execute, changed)).toMatchObject({ retry: true });
    expect(parseEconomyRequest(store.getItem(key))).toEqual(request);
    const receipt = { message: "Deposited 40 Gold Coins." };
    expect(await executeSavedRequest(store, key, parseEconomyRequest(store.getItem(key))!, async () => receipt, changed)).toEqual(receipt);
    expect(store.getItem(key)).toBeNull();
  });
  it("cannot replace an unresolved operation with a new ID or changed amount", async () => {
    const store = storage(), execute = vi.fn(async () => ({}));
    store.setItem(id, JSON.stringify(request));
    for (const next of [
      { ...request, id: "a9600000-0000-4000-8000-000000000002" },
      { ...request, fields: { ...request.fields, amount: "80" } },
    ]) {
      expect(await executeSavedRequest(store, id, next, execute, () => {})).toMatchObject({ error: true });
      expect(parseEconomyRequest(store.getItem(id))).toEqual(request);
    }
    expect(execute).not.toHaveBeenCalled();
  });
  it("fails before sending when storage cannot be written", async () => {
    const store = storage(), execute = vi.fn(async () => ({}));
    store.setItem = () => { throw Error("Quota exceeded"); };
    expect(await executeSavedRequest(store, id, request, execute, () => {})).toMatchObject({ error: true });
    expect(execute).not.toHaveBeenCalled();
  });
  it("retains receipts when clearing storage fails or the server is uncertain", async () => {
    const store = storage();
    store.removeItem = () => { throw Error("Storage disabled"); };
    expect(await executeSavedRequest(store, id, request, async () => ({}), () => {})).toMatchObject({ retry: true });
    expect(parseEconomyRequest(store.getItem(id))).toEqual(request);
    expect(await executeSavedRequest(store, id, request, async () => ({ retry: true }), () => {})).toMatchObject({ retry: true });
    expect(parseEconomyRequest(store.getItem(id))).toEqual(request);
  });
  it("preserves corrupt data for investigation and never sends another mutation", async () => {
    const store = storage(), execute = vi.fn(async () => ({}));
    for (const raw of ["[", "null", "[]", JSON.stringify({ ...request, fields: { ...request.fields, request_id: "bad" } })]) {
      store.setItem(id, raw);
      expect(await executeSavedRequest(store, id, request, execute, () => {})).toMatchObject({ error: true });
      expect(store.getItem(id)).toBe(raw);
    }
    expect(execute).not.toHaveBeenCalled();
  });
  it("isolates characters and clears definite rejections", async () => {
    const store = storage();
    expect(economyJournalKey(id)).not.toBe(economyJournalKey("other"));
    expect(await executeSavedRequest(store, id, request, async () => ({ error: true, message: "Not enough gold" }), () => {})).toMatchObject({ error: true });
    expect(store.getItem(id)).toBeNull();
  });
});
