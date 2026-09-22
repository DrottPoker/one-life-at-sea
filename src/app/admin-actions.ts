"use server";

import { gameplay } from "@/config/public";
import { withDatabaseRetry } from "@/lib/database-retry";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation";
import { adminErrors, type AdminAction, type AdminPayload, type AdminResult } from "@/lib/admin";

export async function runAdminAction(action: AdminAction, payload: AdminPayload, requestId: string, reason: string): Promise<AdminResult> {
  if (!isUuid(requestId) || typeof reason !== "string" || reason.trim().length < 3 || reason.trim().length > 500 ||
      !payload || JSON.stringify(payload).length > 16000) return { error: true, message: adminErrors.INVALID_REQUEST };
  const client = await createClient();
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user || user.is_anonymous) return { error: true, message: adminErrors.ADMIN_REQUIRED };
  // Every RPC checks current database membership, including receipt retries.
  const { data, error } = await withDatabaseRetry(() => client.rpc("admin_mutate", { action, payload, request_id: requestId, reason: reason.trim() }));
  if (error || !data) {
    const message = adminErrors[error?.message ?? ""];
    if (message) return { error: true, message };
    if (error?.code === "23514") {
      for (const [field, label, maximum] of [["energy", "Energy", gameplay.resources.energyStorageMax], ["stamina", "Stamina", gameplay.stamina.storageMaximum]] as const) {
        if (error.message.includes("characters_" + field + "_check")) return { error: true, message: label + " must be a whole number from 0 to " + maximum + "." };
      }
    }
    if (error?.code?.startsWith("22") || error?.code?.startsWith("23")) {
      return { error: true, message: "These values violate a database rule. Check types, ranges, unique names and referenced IDs." };
    }
    return { error: true, retry: true, message: "The result could not be confirmed. Retry the same request to check it safely." };
  }
  revalidatePath("/admin", "layout");
  revalidatePath("/(game)", "layout");
  return { message: data.message, receipt: data };
}

