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
