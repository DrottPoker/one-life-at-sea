import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: vi.fn(), rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.user }, rpc: mocks.rpc }) }));
import { runAdminAction } from "../../src/app/admin-actions";

const requestId = "10000000-0000-4000-8000-000000000001";
const payload = { character_id: "10000000-0000-4000-8000-000000000002", item_id: "oak_logs", quantity: 1 };

describe("admin action account binding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({ data: { user: { id: "current-admin", is_anonymous: false } }, error: null });
    mocks.rpc.mockResolvedValue({ data: { audit_id: "1", message: "Items granted." }, error: null });
  });

  it("retains an unconfirmed request when the signed-in admin changes", async () => {
    expect(await runAdminAction("grant_items", payload, requestId, "Audit fixture", "previous-admin"))
      .toMatchObject({ error: true, retry: true });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("retains an unconfirmed request if administrator membership is revoked", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "ADMIN_REQUIRED" } });
    expect(await runAdminAction("grant_items", payload, requestId, "Audit fixture", "current-admin"))
      .toMatchObject({ error: true, retry: true });
  });

  it("executes for the displayed admin and leaves authorization to the database", async () => {
    expect(await runAdminAction("grant_items", payload, requestId, "Audit fixture", "current-admin"))
      .toMatchObject({ receipt: { audit_id: "1" } });
    expect(mocks.rpc).toHaveBeenCalledWith("admin_mutate", expect.objectContaining({ request_id: requestId }));
  });
});
