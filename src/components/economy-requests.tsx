"use client";

import { createContext, useContext, useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import { marketAction } from "@/app/marketplace-actions";
import { transferGold } from "@/app/bank-actions";
import { trashInventoryItem } from "@/app/inventory-actions";
import { trainingAction } from "@/app/training-actions";
import { useGameRefresh } from "@/components/game-refresh";
import { economyJournalKey, executeSavedRequest, formRequest, parseEconomyRequest, requestForm, type EconomyRequest } from "@/lib/economy-journal";
import type { MarketCommand, MarketActionResult } from "@/lib/marketplace";
import type { BankActionResult } from "@/lib/bank";
import type { TrashResult } from "@/lib/inventory";
import type { TrainingResult } from "@/lib/training";

type Journal = {
  unconfirmed: boolean;
  market: (command: MarketCommand) => Promise<MarketActionResult>;
  bank: (form: FormData) => Promise<BankActionResult>;
  inventory: (form: FormData) => Promise<TrashResult>;
  training: (form: FormData) => Promise<TrainingResult>;
};
const Context = createContext<Journal | null>(null);
const eventName = "economy-request-changed";
function subscribe(listener: () => void) {
  window.addEventListener(eventName, listener);
  window.addEventListener("storage", listener);
  return () => { window.removeEventListener(eventName, listener); window.removeEventListener("storage", listener); };
}
function changed() { window.dispatchEvent(new Event(eventName)); }

export function EconomyRequests({ characterId, children }: { characterId: string; children: ReactNode }) {
  const key = economyJournalKey(characterId), refresh = useGameRefresh();
  const [notice, setNotice] = useState("");
  const [checking, startChecking] = useTransition();
  const raw = useSyncExternalStore(subscribe, () => {
    try { return localStorage.getItem(key); } catch { return "unavailable"; }
  }, () => null);
  let saved: EconomyRequest | null = null, unreadable = false;
  try { saved = parseEconomyRequest(raw); } catch { unreadable = true; }

  async function send<T extends { error?: boolean; retry?: boolean; message?: string }>(request: EconomyRequest, execute: () => Promise<T>) {
    if (!navigator.locks) return { error: true, message: "This browser cannot safely save actions. Use a browser with Web Locks support." };
    try {
      return await navigator.locks.request(key, () => executeSavedRequest(localStorage, key, request, execute, changed));
    } catch {
      return { error: true, retry: true, message: "The action could not be confirmed. Check the saved action before trying again." };
    }
  }
  const journal: Journal = {
    unconfirmed: raw !== null,
    market: command => send({ kind: "market", id: command.request_id, command }, () => marketAction(command, characterId)),
    bank: form => send(formRequest("bank", form), () => transferGold(form, characterId)),
    inventory: form => send(formRequest("inventory", form), () => trashInventoryItem(form, characterId)),
    training: form => send(formRequest("training", form), () => trainingAction(form, characterId)),
  };
  function check(request: EconomyRequest) {
    startChecking(async () => {
      const result = request.kind === "market" ? await journal.market(request.command) :
        await journal[request.kind](requestForm(request.fields));
      setNotice(result.message ?? "");
      refresh.request();
    });
  }
  return <Context.Provider value={journal}>
    {raw !== null && <section className="o-panel o-economy-recovery" aria-label="Unconfirmed action">
      <div className="o-panel-body">
        <strong>Unconfirmed action</strong>
        <p>{unreadable ? "The saved action could not be read. Keep browser data and contact support before making another change." :
          "An action is saved for this character. Check its result before making another change. Retrying uses the same receipt."}</p>
        {saved && <button type="button" className="o-training-button" disabled={checking} onClick={() => check(saved)}>
          {checking ? "Checking..." : "Check saved action"}
        </button>}
      </div>
    </section>}
    {notice && <p className="o-copy" role="status">{notice}</p>}
    {children}
  </Context.Provider>;
}

export function useEconomyRequests() {
  const journal = useContext(Context);
  if (!journal) throw Error("Economy request journal is unavailable.");
  return journal;
}
