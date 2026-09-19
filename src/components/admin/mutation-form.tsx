"use client";

import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAdminRequests } from "@/components/admin/request-journal";
import type { AdminAction, AdminPayload, AdminResult } from "@/lib/admin";

type Request = { action: AdminAction; payload: AdminPayload; reason: string; id: string };
export function MutationForm({ action, payload, label, summary, children, disabled = false }: {
  action: AdminAction; payload: AdminPayload; label: string; summary: string; children?: ReactNode; disabled?: boolean;
}) {
  const router = useRouter();
  const journal = useAdminRequests();
  const [review, setReview] = useState<Request | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<AdminResult | null>(null);
  const inFlight = useRef(false);
  const reasonInput = useRef<HTMLInputElement>(null);
  async function submit() {
    if (!review || inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    try {
      const response = await journal.send(review);
      setResult(response);
      if (!response.error) router.refresh();
    } catch {
      setResult({ error: true, retry: true, message: "The result could not be confirmed. Retry this request to check it safely." });
    } finally { inFlight.current = false; setPending(false); }
  }
  if (result?.receipt) return <div role="status" className="admin-notice"><p>{result.message}</p>
    <p>Audit ID: <code>{result.receipt.audit_id}</code></p>
    {action === "grant_items" && <button type="button" onClick={() => { setReview(null); setResult(null); }}>Done</button>}</div>;
  return <form onSubmit={event => {
    event.preventDefault();
    if (review) { void submit(); return; }
    setResult(null);
    setReview({ action, payload: structuredClone(payload), reason: reasonInput.current!.value.trim(), id: crypto.randomUUID() });
  }}>
    {!review ? <><fieldset disabled={pending}>{children}<label>Reason for change<input ref={reasonInput} name="reason" required minLength={3} maxLength={500} /></label>
      <button type="submit" disabled={disabled}>{label}</button></fieldset></> :
      <section className="admin-confirm"><h3>Confirm administrative change</h3><p>{summary}</p>
        <pre>{JSON.stringify(review.payload, null, 2)}</pre><p>Reason: {review.reason}</p>
        <button type="submit" disabled={pending}>{pending ? "Saving..." : result?.retry ? "Retry same request" : "Confirm change"}</button>
        {!result?.retry && <button type="button" disabled={pending} onClick={() => { setReview(null); setResult(null); }}>Back</button>}
        {result && <p role="alert">{result.message}</p>}
      </section>}
  </form>;
}

