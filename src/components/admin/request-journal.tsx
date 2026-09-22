"use client";

import { createContext, useCallback, useContext, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { runAdminAction } from "@/app/admin-actions";
import type { AdminAction, AdminPayload, AdminResult } from "@/lib/admin";

export type AdminRequest = { action: AdminAction; payload: AdminPayload; reason: string; id: string };
const Journal = createContext<{ send: (request: AdminRequest) => Promise<AdminResult> } | null>(null);
const changeEvent = "admin-request-journal";
const empty = "[]";
function subscribe(listener: () => void) {
  window.addEventListener(changeEvent, listener);
  window.addEventListener("storage", listener);
  return () => { window.removeEventListener(changeEvent, listener); window.removeEventListener("storage", listener); };
}

export function AdminRequestJournal({ userId, children }: { userId: string; children: ReactNode }) {
  const key = "one-life-at-sea:admin-requests:" + userId;
  const router = useRouter();
  const running = useRef(new Map<string, Promise<AdminResult>>());
  const [notice, setNotice] = useState("");
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const snapshot = useSyncExternalStore(subscribe, () => {
    try { return sessionStorage.getItem(key) ?? empty; } catch { return empty; }
  }, () => empty);
  const read = useCallback((): AdminRequest[] => {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(key) ?? empty);
    if (!Array.isArray(parsed)) throw new Error("Invalid request journal.");
    return parsed as AdminRequest[];
  }, [key]);
  const write = useCallback((requests: AdminRequest[]) => {
    sessionStorage.setItem(key, JSON.stringify(requests));
    window.dispatchEvent(new Event(changeEvent));
  }, [key]);
  const send = useCallback((request: AdminRequest): Promise<AdminResult> => {
    const active = running.current.get(request.id);
    if (active) return active;
    setNotice("");
    setPendingIds(previous => [...previous, request.id]);
    const work = Promise.resolve().then(async () => {
      try {
        const existing = read();
        if (!existing.some(entry => entry.id === request.id)) write([...existing, request]);
      } catch {
        return { error: true, message: "The retry receipt could not be saved in this browser. Enable session storage and try again." };
      }
      let result: AdminResult;
      try {
        result = await runAdminAction(request.action, request.payload, request.id, request.reason);
      } catch {
        result = { error: true, retry: true, message: "The result could not be confirmed. Retry this request to check it safely." };
      }
      if (!result.retry) {
        try { write(read().filter(entry => entry.id !== request.id)); } catch { /* Replaying the retained receipt is safe. */ }
      }
      if (result.receipt && request.action.startsWith("save_")) setNotice(result.message);
      return result;
    });
    running.current.set(request.id, work);
    void work.finally(() => { running.current.delete(request.id); setPendingIds(previous => previous.filter(id => id !== request.id)); });
    return work;
  }, [read, write]);
  let requests: AdminRequest[] = [];
  try { requests = JSON.parse(snapshot) as AdminRequest[]; } catch { /* Keep the page usable if storage was edited. */ }
  requests = Array.isArray(requests) ? requests.filter(request => request && typeof request.id === "string" && !pendingIds.includes(request.id)) : [];
  return <Journal.Provider value={{ send }}>
    {requests.length > 0 && <section className="admin-confirm" aria-label="Unconfirmed admin requests"><h2>Unconfirmed admin requests</h2>
      <p>These receipts survive page reloads in this tab. Check a receipt before submitting the same change again.</p>
      {requests.map(request => <div key={request.id}><code>{request.action}</code> · {request.reason}
        <button type="button" onClick={async () => { const result = await send(request); setNotice(result.message); router.refresh(); }}>Check saved request</button></div>)}
    </section>}
    {notice && <p role="status" className="admin-notice">{notice}</p>}
    {children}
  </Journal.Provider>;
}

export function useAdminRequests() {
  const journal = useContext(Journal);
  if (!journal) throw new Error("Admin request journal is unavailable.");
  return journal;
}

