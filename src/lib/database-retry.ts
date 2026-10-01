import { server } from "@/config/server";
import "server-only";

// Retry a concurrently changed engagement as a fresh database transaction.
export async function withDatabaseRetry<T extends { error: { code?: string } | null }>(
  operation: () => PromiseLike<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const result = await operation();
    if (attempt >= server.databaseRetry.retries || !["40001", "40P01"].includes(result.error?.code ?? "")) return result;
    await new Promise(resolve => setTimeout(resolve, server.databaseRetry.delayMs * (attempt + 1)));
  }
}

// A rule the RPC raised itself (raise exception, invalid input, constraint, privilege) rolled the whole
// transaction back, so repeating the same request cannot change the answer. Network failures,
// timeouts and lost responses have no such code and stay retryable. Known codes get their own message first.
export function refusedByDatabase(error: { code?: string } | null) {
  return /^(P0|22|23|42)/.test(error?.code ?? "") ? "This action was refused. Review the refreshed page before trying again." : undefined;
}
