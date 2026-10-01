import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ requireCharacter: vi.fn(), createClient: vi.fn() }));
vi.mock("@/lib/player", () => ({ requireCharacter: mocks.requireCharacter }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { performActivity } from "../../src/app/activity-actions";
import { craftItem } from "../../src/app/crafting-actions";
import { buyTavernMeal } from "../../src/app/tavern-actions";
import { marketAction } from "../../src/app/marketplace-actions";
import { transferGold } from "../../src/app/bank-actions";
import { trashInventoryItem } from "../../src/app/inventory-actions";
import { trainingAction } from "../../src/app/training-actions";

describe("economy actions bind to the displayed character", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCharacter.mockResolvedValue({ id: "current-character" });
  });
  it.each([
    ["activity", () => performActivity(new FormData(), "old-character")],
    ["crafting", () => craftItem(new FormData(), "old-character")],
    ["tavern", () => buyTavernMeal(new FormData(), "old-character")],
    ["market", () => marketAction({}, "old-character")],
    ["bank", () => transferGold(new FormData(), "old-character")],
    ["inventory", () => trashInventoryItem(new FormData(), "old-character")],
    ["training", () => trainingAction(new FormData(), "old-character")],
  ])("does not execute %s after the account changes", async (_name, action) => {
    expect(await action()).toMatchObject({ error: true, retry: true });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});

describe("economy actions keep a saved request only while its outcome is unknown", () => {
  const listingId = "0b6d5f43-6a8f-4f7c-9b9e-0d1d8a7a4c11", requestId = "6f9b8f5e-0c55-4d43-8a1e-2a6f3f8f3d22";
  const respond = (error: { message: string; code?: string }) => mocks.createClient.mockResolvedValue({ rpc: vi.fn().mockResolvedValue({ data: null, error }) });
  const cancel = () => marketAction({ action: "cancel", request_id: requestId, listing_id: listingId }, "current-character");
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCharacter.mockResolvedValue({ id: "current-character" });
  });
  it("explains an item that was equipped in another tab", async () => {
    respond({ message: "ITEM_EQUIPPED", code: "P0001" });
    expect(await cancel()).toEqual({ error: true, retry: false, message: "Unequip this item before listing it." });
  });
  it("releases a request the database refused with a rule it raised", async () => {
    respond({ message: "SOME_FUTURE_RULE", code: "P0001" });
    expect(await cancel()).toMatchObject({ error: true, retry: false, message: "This action was refused. Review the refreshed page before trying again." });
  });
  it("keeps a request whose response was lost", async () => {
    respond({ message: "TypeError: fetch failed", code: "" });
    expect(await cancel()).toMatchObject({ error: true, retry: true });
  });
});
