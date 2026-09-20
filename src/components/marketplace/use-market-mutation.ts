"use client";

import { useRef, useState, useTransition } from "react";
import { useEconomyRequests } from "@/components/economy-requests";
import { useGameState } from "@/components/game-state";
import { useGameRefresh } from "@/components/game-refresh";
import { marketBlockedReason, type MarketActionResult, type MarketCommand, type MarketOperation, type MarketReceipt } from "@/lib/marketplace";

export function useMarketMutation(onSuccess?: (receipt: MarketReceipt) => void) {
  const state = useGameState(), refresh = useGameRefresh(), journal = useEconomyRequests();
  const [result, setResult] = useState<MarketActionResult>({});
  const [pending, start] = useTransition();
  const attempt = useRef<MarketCommand | null>(null);
  const blocked = marketBlockedReason(state) ?? (journal.unconfirmed && !result.retry && !pending ? "Check the saved action before trading." : null);
  function run(operation?: MarketOperation) {
    if (blocked || pending) return;
    if (!attempt.current && operation) attempt.current = { ...operation, request_id: crypto.randomUUID() };
    const command = attempt.current;
    if (!command) return;
    start(async () => {
      let response: MarketActionResult;
      try { response = await journal.market(command); }
      catch { response = { error: true, retry: true, message: "The trade could not be confirmed. Retry safely to check the same request." }; }
      setResult(response);
      if (!response.retry) attempt.current = null;
      if (response.receipt) onSuccess?.(response.receipt);
      refresh.request();
    });
  }
  return { pending, result, blocked, run };
}
