import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), context: vi.fn(), snapshot: vi.fn(), revision: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ getSupabaseConfig: () => ({ url: "http://localhost", key: "test" }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.user } }) }));
vi.mock("@/lib/player-context", () => ({ playerContext: mocks.context, playerSnapshot: mocks.snapshot }));
vi.mock("@/config/revision", () => ({ assertGameplayRevision: mocks.revision }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw Error("redirect:" + path); } }));
import { requireCharacter } from "../../src/lib/player";

describe("player loading and action guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({ data: { user: { id: "account", is_anonymous: false } }, error: null });
    mocks.context.mockResolvedValue({ character: { id: "captain", user_id: "account" } });
    mocks.snapshot.mockResolvedValue({ state: { hospital_until: null, sea: { state: "in_harbor" } } });
  });
  it("avoids a settling read when both navigation exceptions already apply", async () => {
    expect(await requireCharacter({ allowHospital: true, allowSea: true })).toMatchObject({ id: "captain" });
    expect(mocks.user).toHaveBeenCalled();
    expect(mocks.revision).toHaveBeenCalled();
    expect(mocks.snapshot).not.toHaveBeenCalled();
  });
  it("still enforces the hospital guard for combat and normal pages", async () => {
    mocks.snapshot.mockResolvedValue({ state: { hospital_until: "future", sea: { state: "in_harbor" } } });
    await expect(requireCharacter({ allowSea: true })).rejects.toThrow("redirect:/harbor/hospital");
  });
  it("still enforces the sea guard when hospital access is allowed", async () => {
    mocks.snapshot.mockResolvedValue({ state: { hospital_until: null, sea: { state: "at_sea" } } });
    await expect(requireCharacter({ allowHospital: true })).rejects.toThrow("redirect:/sea");
  });
  it("does not trust a character belonging to a different account", async () => {
    mocks.context.mockResolvedValue({ character: { id: "captain", user_id: "other" } });
    await expect(requireCharacter({ allowHospital: true, allowSea: true })).rejects.toThrow("redirect:/create-character");
  });
  it("requires a registered authenticated user before loading private context", async () => {
    mocks.user.mockResolvedValue({ data: { user: null }, error: null });
    await expect(requireCharacter({ allowHospital: true, allowSea: true })).rejects.toThrow("redirect:/login");
    expect(mocks.context).not.toHaveBeenCalled();
    expect(mocks.snapshot).not.toHaveBeenCalled();
  });
});
