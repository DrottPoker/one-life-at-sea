"use client";

import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAdminRequests } from "@/components/admin/request-journal";
import { adminLabel, type AdminAction, type AdminPayload, type AdminResult } from "@/lib/admin";

type Request = { action: AdminAction; payload: AdminPayload; reason: string; id: string };
export function MutationForm({ action, payload, label, summary, children, disabled = false, successHref }: {
  action: AdminAction; payload: AdminPayload; label: string; summary: string; children?: ReactNode; disabled?: boolean; successHref?: string;
}) {
  const router = useRouter(), journal = useAdminRequests();
  const [review, setReview] = useState<Request | null>(null), [pending, setPending] = useState(false);
  const [result, setResult] = useState<AdminResult | null>(null);
  const inFlight = useRef(false), reasonInput = useRef<HTMLInputElement>(null);
  async function submit() {
    if (!review || inFlight.current) return;
    inFlight.current = true; setPending(true);
    try {
      const response = await journal.send(review);
      setResult(response);
      if (!response.error) router.refresh();
    } catch { setResult({ error: true, retry: true, message: "The result could not be confirmed. Retry this request to check it safely." }); }
    finally { inFlight.current = false; setPending(false); }
  }
  if (result?.receipt) return <div role="status" className="admin-notice"><p>{result.message}</p>
    <Link href={"/admin/database/admin_audit?field=id&value=" + result.receipt.audit_id}>View this change in the audit log</Link>
    {successHref && <Link className="admin-primary-link" href={successHref}>Done</Link>}
    {action === "grant_items" && <button type="button" onClick={() => { setReview(null); setResult(null); }}>Done</button>}</div>;
  const changes = review?.payload.changes;
  const values = changes && typeof changes === "object" && !Array.isArray(changes) ? changes : review?.payload;
  return <form onSubmit={event => {
    event.preventDefault();
    if (review) { void submit(); return; }
    setResult(null);
    setReview({ action, payload: structuredClone(payload), reason: reasonInput.current!.value.trim(), id: crypto.randomUUID() });
  }}>
    {!review ? <><fieldset disabled={pending}>{children}<div className="admin-save-bar"><label>Reason for change<input ref={reasonInput} name="reason" required minLength={3} maxLength={500} placeholder="Briefly describe why you are making this change" /></label>
      <button type="submit" disabled={disabled}>{label}</button></div></fieldset></> :
      <section className="admin-confirm"><h3>Review change</h3><p>{summary}</p>
        <dl className="admin-review-values">{Object.entries(values ?? {}).filter(([key, value]) => !["version", "key", "resource", "id", "character_id"].includes(key) && (value === null || typeof value !== "object")).map(([key, value]) =>
          <div key={key}><dt>{adminLabel(key)}</dt><dd>{value === null ? "None" : typeof value === "boolean" ? value ? "Yes" : "No" : String(value)}</dd></div>)}</dl>
        <p><strong>Reason:</strong> {review.reason}</p><details><summary>Technical details</summary><pre>{JSON.stringify(review.payload, null, 2)}</pre></details>
        <button type="submit" disabled={pending}>{pending ? "Saving..." : result?.retry ? "Retry same request" : "Confirm change"}</button>
        {!result?.retry && <button className="admin-secondary" type="button" disabled={pending} onClick={() => { setReview(null); setResult(null); }}>Back</button>}
        {result && <p role="alert" className="admin-error">{result.message}</p>}
      </section>}
  </form>;
}
