"use client";

import { createContext, useCallback, useContext, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { runAdminAction } from "@/app/admin-actions";
import type { AdminResult } from "@/lib/admin";
import { isAdminRequest, parseAdminRequests, type AdminRequest } from "@/lib/admin-journal";
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
    try { return sessionStorage.getItem(key) ?? empty; } catch { return "unavailable"; }
  }, () => empty);
  const read = useCallback((): AdminRequest[] => {
    return parseAdminRequests(sessionStorage.getItem(key));
  }, [key]);
  const write = useCallback((requests: AdminRequest[]) => {
    sessionStorage.setItem(key, JSON.stringify(requests));
    window.dispatchEvent(new Event(changeEvent));
  }, [key]);
  const send = useCallback((request: AdminRequest): Promise<AdminResult> => {
    if (!isAdminRequest(request)) return Promise.resolve({ error: true, message: "This admin request is invalid. Reload the page." });
    const active = running.current.get(request.id);
    if (active) return active;
    setNotice("");
    setPendingIds(previous => [...previous, request.id]);
    const work = Promise.resolve().then(async () => {
      try {
        const existing = read();
        const saved = existing.find(entry => entry.id === request.id);
        if (saved && JSON.stringify(saved) !== JSON.stringify(request)) {
          return { error: true, retry: true, message: "The saved request has different values. Check the original request first." };
        }
        if (!saved) write([...existing, request]);
      } catch {
        return { error: true, message: "The retry receipt could not be saved in this browser. Enable session storage and try again." };
      }
      let result: AdminResult;
      try {
        result = await runAdminAction(request.action, request.payload, request.id, request.reason, userId);
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
  }, [read, write, userId]);
  let requests: AdminRequest[] = [], unreadable = false;
  try { requests = parseAdminRequests(snapshot).filter(request => !pendingIds.includes(request.id)); } catch { unreadable = true; }
  return <Journal.Provider value={{ send }}>
    {unreadable && <p role="alert" className="admin-error">Saved admin requests could not be read. Keep browser data, allow session storage and reload before making another change.</p>}
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

