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
